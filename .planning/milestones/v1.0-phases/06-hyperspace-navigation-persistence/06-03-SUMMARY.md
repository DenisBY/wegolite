---
phase: 06-hyperspace-navigation-persistence
plan: 03
subsystem: ui
tags: [galactic-chart, canvas2d, projection, graph, navigation, label-collision]

requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: plan 06-01's Oolite integer chart distance, fuel cost and jump-time module
  - phase: 02-data-pipeline-fidelity
    provides: the compiled 256-system galaxy 0 chunk with chartX/chartY/systemIndex
provides:
  - an isotropic 2:1 letterboxed chart projection and the full 256-system graph
  - short/long range windows with a true fuel circle and 875 trunc-derived edges
  - deterministic click, arrow and label-collision selection helpers
  - a pure Canvas2D painter and a paint-on-change policy
  - the hidden #chart overlay markup, DPR-capped canvas lifecycle and readout fields
affects: [06-04 session wiring and browser chart proofs, 06-06 end-to-end proof]

actuals:
  tokens: 14066
  tasks: 3
  commits: 5
  plan_head_before: 3e345d3ad3f9f80989ef6ffa73c8fd5774ae22f0
  plan_head_after: ed039c1a6600c5117096934433ab47ba5e5f8fde

tech-stack:
  added: []
  patterns:
    - Pure view model + pure Canvas2D painter + thin DOM shell
    - All systems stay in the marker model; a visibility flag gates range clipping
    - Paint on open/selection/range/resize via a structural diff, never per frame
    - textContent-only overlays with no second document footer

key-files:
  created:
    - src/ui/chart-model.ts
    - src/ui/chart-draw.ts
    - src/ui/chart.ts
    - tests/ui/chart-model.test.ts
    - tests/ui/chart-draw.test.ts
  modified:
    - index.html

key-decisions:
  - "Short range is a fixed window of ±40 chart-x and ±80 chart-y (half-spans), i.e. ±40 distance units, and never pans; long range is the full 256 x 256 chart."
  - "Every range keeps all 256 markers in the model; `visible` gates hit testing, labels and painting so off-window systems keep their name and arrow reachability."
  - "The current marker reads 0.0 LY / 0 fuel instead of jumpBetween's dist-0 minimum of 1 fuel, because the current system can never start a jump."
  - "ChartView.labels is always empty from the model; the shell fills it with selectLabels(view, measureText) before painting, preserving the no-DOM rule."
  - "Label collision uses a fixed 12 px box in systemIndex order, forcing the current system and committed target to draw."
  - "needsChartRepaint compares range, current/target/selection, marker/edge/label counts and the viewport; a 0x0 next size never repaints."
  - "The fuel circle is derived from chart units (fuel / 4 chart-x) and is a true circle because the y axis is halved."

patterns-established:
  - "Chart model declares every shape and returns data only; chart.ts owns DOM, sizing and listeners."
  - "Recording-stub painter tests prove draw order and the 0x0 skip without jsdom."
  - "Overlay footer fields are independent textContent writers, matching the station shell."

requirements-completed: [NAV-01, NAV-02]

coverage:
  - id: D1
    description: "Isotropic 2:1 letterboxed projection, plotted markers with distance/fuel/reachability and the pure click hit test"
    requirement: "NAV-01"
    verification:
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#chart projection"
        status: pass
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#buildChartView"
        status: pass
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#hitTest"
        status: pass
    human_judgment: false
  - id: D2
    description: "The full 256-system graph: 875 trunc edges, both range windows, exact Lave neighbourhood, arrow selection, unreachable retention, label collision and purity"
    requirement: "NAV-01"
    verification:
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#the 7 LY graph"
        status: pass
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#nearestInDirection"
        status: pass
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#reachability"
        status: pass
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#selectLabels"
        status: pass
      - kind: unit
        ref: "tests/ui/chart-model.test.ts#purity and the fuel circle"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pure Canvas2D painter with the fixed edges/circle/target/markers/labels order, the 0x0 no-op and the structural repaint policy"
    requirement: "NAV-01"
    verification:
      - kind: unit
        ref: "tests/ui/chart-draw.test.ts#drawChart"
        status: pass
      - kind: unit
        ref: "tests/ui/chart-draw.test.ts#needsChartRepaint"
        status: pass
    human_judgment: false
  - id: D4
    description: "The #chart overlay shell: DPR-capped canvas, resize view rebuild, pointer routing, paint counter, textContent readout and no second footer"
    requirement: "NAV-02"
    verification:
      - kind: other
        ref: "docker compose run --rm typecheck"
        status: pass
      - kind: other
        ref: "rg acceptance scans: 4 textContent writes, one #chart-canvas, one document <footer>"
        status: pass
    human_judgment: true
    rationale: "Browser paint accounting (data-paints flat across frames) and pointer routing are exercised by plan 06-04's tests/e2e/hyperspace.spec.ts; this plan proves the policy and typechecks the shell."

duration: 14min
completed: 2026-11-06
status: complete
---

# Phase 6 Plan 3: Galactic Chart Summary

**An isotropic 256-system galactic chart model with a trunc-derived 875-edge 7 LY graph, deterministic click/arrow/label selection, and a pure Canvas2D painter that repaints only on change**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-06T18:00:00Z
- **Completed:** 2026-11-06T18:13:47Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- `src/ui/chart-model.ts` projects chart coordinates through the Oolite 2:1 geometry: `k = min(width / chartSpanX, height / (chartSpanY / 2))`, `screenY` inverted, and a centred letterboxed rectangle. Equal jump distances are equal pixels and the fuel circle is a true circle (`fuel / 4` chart-x = `fuel / 10` LY).
- `buildChartView` keeps all 256 systems in both ranges, plots `distanceLy`, integer `fuelCost`, `reachable`, `unreachableReason`, current/target/selected state and a `visible` window flag. Long range emits 875 edges at the trunc rule; the floor variant is proved to be 866.
- Lave's six neighbours are pinned exactly (Leesti 3.6, Diso 3.6, Reorte 4.4, Zaonce 5.6, Riedquat 6.8, Orerve 6.8); Quator (7.2) has no edge. Unreachable systems stay named, selectable and dimmed rather than removed.
- `nearestInDirection` uses distance-space `dy / 2`, rejects non-progressing candidates, scores `lateral * 1000 + forward + systemIndex * 1e-6`, and breaks exact ties by `systemIndex`.
- `selectLabels` fills labels in `systemIndex` order, skips intersecting boxes, and always keeps the current system and target. It never measures text itself; the shell injects `measureText`.
- `src/ui/chart-draw.ts` paints in the required order: clear, 875 edges in one path, the fuel circle, a dashed amber current-to-target line, markers, then labels. A 0x0 size returns `false` before touching the context. `needsChartRepaint` repaints only on range/selection/target/count/viewport changes.
- `src/ui/chart.ts` owns the DPR-capped backing store, a `ResizeObserver` view rebuild, pointer routing through the pure `hitTest`, an `AbortController` and a `data-paints` counter. The `#chart` markup is hidden by default, has one canvas and reuses the station header/footer language without a second `<footer>`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Projection, plotted markers and a click hit test** - `01ba23a` (feat)
2. **Task 2: Full 256-system graph, both ranges and selection proofs** - `fe01f93` (test)
3. **Task 3: Canvas overlay shell, unit-tested painter and #chart markup** - `8a27cda` (feat)
4. **Formatting follow-up** - `0d4c689` (style)
5. **Full marker set in both ranges** - `ed039c1` (fix)

**Plan metadata:** committed separately after this summary.

## Files Created/Modified

- `src/ui/chart-model.ts` - projection, 256 markers, 875 edges, both windows, fuel circle, hit test, arrow search, readout and label selection.
- `src/ui/chart-draw.ts` - pure Canvas2D painter, colours/fonts, `drawChart` and `needsChartRepaint`.
- `src/ui/chart.ts` - `createChart` DOM shell, canvas lifecycle, resize rebuild, pointer routing and `data-paints`.
- `tests/ui/chart-model.test.ts` - projection/letterbox, Lave/Diso readout, graph counts, neighbour table, arrows, reachability, labels and purity.
- `tests/ui/chart-draw.test.ts` - recording-stub draw order, 0x0 skip, `fillText` labels and repaint policy.
- `index.html` - hidden `#chart` overlay, `#chart-canvas`, four readout fields and scoped CSS.

## Decisions Made

- **Range geometry:** short range is a fixed ±40 chart-x / ±80 chart-y half-span (±40 distance units, no pan); long range is the 256 x 256 chart centred at 128,128.
- **Marker completeness:** D-04's "all 256 systems in both projections" is honoured by keeping every system in `markers`; `visible` gates clicks, labels and paint for the short window. This supersedes an initial window-filtered implementation.
- **Current-system readout:** the current marker reports 0.0 LY / 0 fuel rather than `jumpBetween`'s dist-0 fuel minimum of 1, because D-03 forbids starting a jump from the current system. The sim still recomputes every cost at commit.
- **Label measurement:** the model cannot measure text, so `ChartView.labels` is always `[]` from `buildChartView`; the shell completes it with `selectLabels(view, context.measureText)`.
- **Paint policy:** `needsChartRepaint` compares the plan's structural fields (range, current/target/selection, marker/edge/label counts, viewport) and refuses a 0x0 next size. No `requestAnimationFrame` loop exists.
- **Circle derivation:** the radius comes from chart units, not pixels, which is what makes it a true circle after the y-axis halving.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Kept the full 256-marker model in the short range**
- **Found during:** Task 2 acceptance review, before the plan-level verification
- **Issue:** the first short-range implementation filtered `markers` to the visible window. D-04 and the plan's must-haves require all 256 systems to remain in the model in both projections, and `06-VALIDATION.md` pins "256 markers, 875 edges, both ranges".
- **Fix:** every system now yields a marker with a `visible` flag; `hitTest`, `selectLabels` and `drawChart` skip off-window markers except the current system and target. Edge connectivity still comes only from `chartDistance`.
- **Files modified:** `src/ui/chart-model.ts`, `src/ui/chart-draw.ts`, `tests/ui/chart-model.test.ts`
- **Verification:** the short and long tests both assert 256 markers; all 26 targeted tests pass.
- **Committed in:** `ed039c1`

**2. [Rule 3 - Blocking] Prettier formatting gate**
- **Found during:** plan-level `docker compose run --rm lint`
- **Issue:** `prettier --check` flagged four new/changed TypeScript files.
- **Fix:** ran Prettier on exactly those files; formatting only, no semantic change.
- **Files modified:** `src/ui/chart-model.ts`, `src/ui/chart.ts`, `tests/ui/chart-model.test.ts`, `tests/ui/chart-draw.test.ts`
- **Verification:** `docker compose run --rm lint` is green.
- **Committed in:** `0d4c689`

---

**Total deviations:** 2 auto-fixed (1 completeness correction, 1 formatting).
**Impact on plan:** Both keep the plan's stated chart contract and the lint gate green. No scope creep and no change to the runtime chart semantics.

## Issues Encountered

- Task 2 was committed as `test(06-03)` because Task 1's action already required the full graph and both windows, so the Task 2 implementation was present when its tests were written. RED was observed for both new test files (missing module), then GREEN; the plan is `type: execute`, so the per-task atomic commit shape is retained.
- The short-range projection was initially window-filtered; the D-04 completeness review above corrected it before the final verification.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

- `docker compose run --rm test npx vitest run tests/ui/chart-model.test.ts tests/ui/chart-draw.test.ts` → 2 files, 26 tests passed.
- `docker compose run --rm test` (full unit suite) → 87 files, 1,064 tests passed.
- `docker compose run --rm typecheck` → `tsconfig.json` and `tsconfig.sim.json` clean.
- `docker compose run --rm lint` → ESLint clean and Prettier "All matched files use Prettier code style!".
- `rg -n "textContent" src/ui/chart.ts` → four assignments (target, distance, fuel, keys) plus the module comment.
- `rg -n "document|window|HTML" src/ui/chart-draw.ts` → no match.
- `rg -n 'id="chart"|id="chart-canvas"|<footer' index.html` → one hidden `#chart`, one `#chart-canvas`, one document `<footer>`.
- `rg -n "setViewBuilder|data-paints|paintCount" src/ui/chart.ts` → the resize builder hook and paint counter are present.

## Next Phase Readiness

- Plan 06-04 can call `createChart(document.body)`, install `chart.setViewBuilder(viewport => buildChartView(galaxy0(), currentId, targetId, range, fuel, viewport, selectedId))`, and route `chart.onSelect(id)` into the session's selection state.
- `#chart` is hidden by default and sits below the pause overlay (`z-index: 10` vs `20`); the session owns open/close, range toggling and Enter/Esc semantics.
- Browser-side paint accounting (`data-paints` flat across frames) and the single-`<footer>` assertion remain plan 06-04 Task 1's proof.
- No blockers.

---

*Phase: 06-hyperspace-navigation-persistence*
*Completed: 2026-11-06*

## Self-Check: PASSED

- `[ -f src/ui/chart-model.ts ]` → FOUND
- `[ -f src/ui/chart-draw.ts ]` → FOUND
- `[ -f src/ui/chart.ts ]` → FOUND
- `[ -f tests/ui/chart-model.test.ts ]` → FOUND
- `[ -f tests/ui/chart-draw.test.ts ]` → FOUND
- `git merge-base --is-ancestor 01ba23a HEAD` → FOUND
- `git merge-base --is-ancestor fe01f93 HEAD` → FOUND
- `git merge-base --is-ancestor 8a27cda HEAD` → FOUND
- `git merge-base --is-ancestor 0d4c689 HEAD` → FOUND
- `git merge-base --is-ancestor ed039c1 HEAD` → FOUND
