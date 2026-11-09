# Quick Task 261109-lsz: Zoomable/pannable F6 chart - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Task Boundary

Add mouse-wheel zoom and drag-to-pan to the F6 galactic chart. Remove the
Short/Long sub-tab buttons while keeping both views as presets (opening view =
local window around the current system; Tab = toggle local/whole galaxy).

</domain>

<decisions>
## Implementation Decisions

### Camera model
- D-01: Replace the fixed `ChartRange` window with an explicit camera
  `{ centre, spanX }`; `spanY = 2 * spanX` because the projection halves the
  y axis. The existing `chartProjection()` already accepts centre/span, so this
  is an extension, not a rewrite.
- D-02: `visible` means "inside the current viewport", not "inside a fixed
  short/long window". All 256 markers stay in the view model; off-screen
  current/target/selected markers still paint (the canvas clips them) and stay
  label candidates. Hit-testing and arrow navigation continue to operate only
  on visible markers.

### Zoom and pan
- D-03: Mouse wheel zooms continuously, anchored under the cursor (not the
  screen centre). Clamp the span between the whole galaxy (`256`) and roughly
  4x closer than the old short preset (`spanX = 20`).
- D-04: Drag pans with Pointer Events and `setPointerCapture`, left button
  only. Use a ~3 px threshold to distinguish a click from a drag and suppress
  the click that follows a drag. Cursor is `grab` / `grabbing`.
- D-05: Clamp the camera centre so the view cannot leave the galaxy bounds
  (`0..256`), matching Oolite's `adjusted_chart_centre` behaviour.
  - Amendment (manual UAT 2026-11-09): clamp only the centre to `0..256`; the
    visible window may overhang an edge so the player can pan an edge to the
    middle of the screen. Clamping the whole window stopped vertical panning
    early.

### Presets and header
- D-06: Open the chart at the local preset centred on the current system.
  Tab toggles between the local preset and the whole-galaxy preset
  (centre `128,128`, span `256`). Remove the Short/Long sub-tab buttons from
  the chart header.
- D-07: Keep the `chartRange` input action as the Tab binding, but redefine it
  as "toggle chart preset". Update its label and the footer hint accordingly
  (no `Short`/`Long` wording).

### Labels and repaint
- D-08: At far zoom, labels are limited to current, target, selected and the
  nearest few systems; more names appear as the user zooms in. Do not draw the
  full 256-name set at whole-galaxy zoom.
- D-09: `needsChartRepaint()` must compare camera centre and span so pan/zoom
  repaints. Coalesce wheel/drag paints with `requestAnimationFrame`; keep the
  chart's existing non-animated behaviour for open/selection/resize.

### Verification and docs
- D-10: Expose the camera (or equivalent centre/span) in the probe so e2e
  helpers can compute chart screen points without a fixed range. Update
  `tests/e2e/helpers/chart.ts` and the specs that currently press Tab to reach
  the long range.
- D-11: Update `README.md` controls, `REQUIREMENTS.md` NAV-01 wording, and
  record the camera/preset decision in `.planning/PROJECT.md` Key Decisions.

### the agent's Discretion
- Exact wheel zoom step (recommended ~1.1-1.2 per notch) and delta
  normalization (`deltaMode`, trackpad).
- Exact "nearest few" label count and the zoom threshold at which full
  collision culling resumes.
- Whether to add Home = centre on current system and End = centre on
  selected/target.
- Whether the camera resets to the local preset on every open or persists for
  the session.
- Whether to animate preset transitions (default: no animation).

</decisions>

<specifics>
## Specific Ideas

- Oolite reference: `PlayerEntityControls.m:1939-2008` (drag pan with a 2 px
  click threshold, wheel zoom x1.05), `PlayerEntity.h:94-106`
  (`CHART_MAX_ZOOM 4`, `CHART_ZOOM_SHOW_LABELS 2.0`), `PlayerEntity.m:500-558`
  (`adjusted_chart_centre`).
- Existing commands must keep working: `Tab` reaches the whole-galaxy view,
  `Enter` commits the selected target, arrows move selection, `Esc` closes.

</specifics>

<canonical_refs>
## Canonical References

- `/home/opencode/git/oolite` — upstream Oolite checkout for chart behaviour.
- `.planning/REQUIREMENTS.md` NAV-01.
- `.planning/PROJECT.md` Key Decisions.

</canonical_refs>
