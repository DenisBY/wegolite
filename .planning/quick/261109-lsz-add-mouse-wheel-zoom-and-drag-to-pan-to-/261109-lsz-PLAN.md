---
phase: quick-261109-lsz
plan: 261109-lsz
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/chart-model.ts
  - src/ui/chart.ts
  - src/ui/chart-draw.ts
  - src/ui/station-tabs.ts
  - src/ui/station-nav.ts
  - src/app/game-session.ts
  - src/app/probe.ts
  - src/input/actions.ts
  - index.html
  - README.md
  - .planning/REQUIREMENTS.md
  - .planning/PROJECT.md
  - tests/ui/chart-model.test.ts
  - tests/ui/chart-draw.test.ts
  - tests/ui/station-tabs.test.ts
  - tests/input/bindings.test.ts
  - tests/e2e/helpers/chart.ts
  - tests/e2e/hyperspace.spec.ts
  - tests/e2e/core-loop.spec.ts
  - tests/e2e/autosave.spec.ts
  - tests/e2e/station-tabs.spec.ts
  - tests/e2e/chart-gestures.spec.ts
autonomous: true
requirements: []
gap_closure: false
estimate:
  tokens: 120000
  raw_tokens: 120000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "The F6 chart opens on the local preset centred on the current system. Mouse wheel zooms continuously around the cursor between spanX 20 and spanX 256; dragging with the left button pans; a click without a drag still selects a marker. Arrow navigation, Enter commit and Escape close are unchanged (D-01..D-04, D-06)."
    - "Tab toggles between the local preset (around the current system) and the whole-galaxy preset (centre 128,128, spanX 256). The Short/Long sub-tab buttons are gone from the chart header; the Tab action is relabelled a preset toggle (D-06, D-07)."
    - "The camera is clamped so the view cannot leave the galaxy's 0..256 extent; wheel and drag never produce a non-finite or out-of-bounds camera. Off-screen current, target and selected markers still paint and stay label candidates; only visible markers are hit-tested and arrow-selectable (D-02, D-05)."
    - "At whole-galaxy zoom labels are limited to current, target, selected and the nearest few systems; more names appear as the view zooms in. needsChartRepaint compares camera centre and span so pan and zoom repaint, coalesced with requestAnimationFrame; open, selection and resize stay immediate (D-08, D-09)."
    - "The probe publishes the camera, and the e2e chart helper and every spec that used a fixed range compute screen points from it (D-10)."
    - "README controls, REQUIREMENTS NAV-01 and PROJECT.md Key Decisions describe the camera, presets and mouse gestures (D-11)."
  artifacts:
    - "src/ui/chart-model.ts"
    - "src/ui/chart.ts"
    - "src/ui/chart-draw.ts"
    - "src/app/game-session.ts"
    - "src/app/probe.ts"
    - "tests/e2e/helpers/chart.ts"
    - "tests/e2e/chart-gestures.spec.ts"
    - ".planning/PROJECT.md"
  key_links:
    - "chart.ts owns pointer and wheel state, computes candidate cameras with the pure helpers in chart-model.ts, and coalesces them through onCamera into game-session.ts, which stores chartCamera, rebuilds the view through buildChartView and repaints only when needsChartRepaint sees the camera change."
    - "openChart sets chartCamera to localPreset(system); applyChartAction chartRange calls toggleChartPreset; setChartViewBuilder and currentChartView both read the one chartCamera."
    - "ChartView.centre/chartSpanX/chartSpanY are the single camera contract shared by chartProjection, chart-draw, the probe and tests/e2e/helpers/chart.ts."
---

<objective>
Replace the two fixed F6 chart windows with a continuous camera: mouse-wheel zoom anchored under the cursor, left-button drag panning, and the local/whole-galaxy views kept only as presets (open local, Tab toggles). Remove the Short/Long sub-tab row.

Purpose: the chart becomes a navigable map instead of a two-state toggle, matching Oolite's zoomable star chart (D-01..D-11 in the CONTEXT). The camera lives in the pure model, the shell owns gesture state, and the session owns selection, target and preset.

Output: a `ChartCamera` model with zoom/pan/clamp helpers and a zoom-aware label policy, pointer/wheel gesture wiring in the chart shell, session camera state and preset toggle, a probe that exposes the camera, updated unit and browser tests, and the doc updates.

Decomposition note: Task 1 is the tracer — one camera path wired end-to-end (model → shell → session → probe → e2e helper) and all mechanical type-level call-site updates, because `tsconfig.json` typechecks `tests/**`. Task 2 adds the behavioural proof (unit camera/label/repaint cases and the browser zoom/pan/preset/sub-tab specs). Task 3 is the non-code documentation and its contract test.
</objective>

<non_goals>
- No animated preset transition. Open, selection, resize and preset changes paint immediately; only wheel and drag coalesce with requestAnimationFrame (D-09).
- No Home/End recenter keys unless implemented as a trivial extra; the preset toggle is Tab (discretion in the CONTEXT).
- No touch gestures, pinch zoom, or mobile layout work. Desktop web only, as in PROJECT.md.
- No persistence of the chart camera across sessions or saves; the camera resets to the local preset on every open (discretion in the CONTEXT).
- No change to chart connectivity, distance, fuel or reachability maths, no change under `src/sim/`, no save-schema change, no new dependency, no server, no database.
- No Oolite ANA route drawing or a moving chart cursor; the existing static selection model stays.
- The README Controls tables stay exactly one row per bound action (tests/contract/readme.test.ts rejects extra rows); mouse gestures are documented as prose, never as extra table rows.
</non_goals>

<interfaces>
Facts verified while planning. Symbol names are authoritative; line numbers may drift.

src/ui/chart-model.ts
- `ChartRange = "short" | "long"` (line 34) is the only fixed-window type. `SHORT_SPAN_X = 80`, `SHORT_SPAN_Y = 160`, `LONG_SPAN_X/Y = 256`, `LONG_CENTRE = 128,128` (`centreFor`, `spanFor`). `chartProjection(viewport, centre, spanX, spanY)` already accepts an arbitrary centre/span and halves the y axis; `projectionScale` is `min(width/spanX, height/(spanY/2))`.
- `ChartView` carries `centre`, `chartSpanX`, `chartSpanY`, `range`, `viewport`, `markers`, `edges`, `labels`, `circle`, `projection`, ids. `ChartMarker.visible` gates painting, `hitTest` and `visibleSystemIds`.
- `buildChartView(systems, currentId, targetId, range, fuel, viewport, selectedId)` projects all 256 systems; the short window filters edges only when both endpoints are outside; `selectLabels(view, measure)` collision-culls and forces current/target/selected.
- This module is pure: no DOM, no canvas, no Three.js. Determinism is required.

src/ui/chart.ts
- One `#chart` overlay, one `#chart-canvas`; `HIT_RADIUS = 14`; `KEY_HINT` still says "Tab: range". One `click` listener hit-tests and calls `selectHandler`. ResizeObserver rebuilds through the builder. API today: `show/setViewBuilder/viewport/view/hide/onSelect/dispose`. `paint` calls `drawChart` and increments `data-paints`.

src/ui/chart-draw.ts
- `drawChart` paints edges, fuel circle, target line, markers (off-window current/target/selected still painted), labels. `needsChartRepaint(previous, next)` compares `range`, ids, marker/edge/label counts and viewport but not centre/span.

src/ui/station-tabs.ts and src/ui/station-nav.ts
- `CHART_SUBTABS` (Short/Long) is consumed by `station-nav.ts`; `StationNavState.range: ChartRange` flows into the sub-tab `aria-pressed` and the cache key; `onChartRange(range)` reaches `setChartRange` in the session. `SUBNAV_HOSTS = ["status","chart"]`.

src/app/game-session.ts
- `chartRange` state (403), `setChartRange` (1706), `currentChartView` (1757), `refreshChart` (1769), `openChart` (1775) / `closeChart` (1802), `moveChartSelection` (1931), `applyChartAction` chartRange case (1964), `currentNavState` range (851), probe chart (2370), builder (2927), `createStationNav` onChartRange (2966), dispose (3173).

src/app/probe.ts
- `WegoliteChartProbe { open, range: "short"|"long", targetId?, selectedId? }`; `probe.chart` field on the live probe. e2e specs read it.

src/input/actions.ts
- `chartRange` action id, default `["Tab"]`, label "Chart range", context `["chart"]`. The action id must be preserved; only the label and its meaning change.

index.html
- `#chart` markup (861-884) includes the `div.station-subnav[data-station-subnav="chart"]`; chart CSS at 431-470. The canvas is `flex:1`.
- `tests/e2e/helpers/chart.ts` calls `buildChartView` with `range`; `tests/e2e/{hyperspace,core-loop,autosave,station-tabs}.spec.ts` pass `probe.chart?.range` and press Tab to reach "long". `tests/ui/chart-model.test.ts` has 21 `buildChartView` calls with range strings; `tests/ui/chart-draw.test.ts` passes range into `labelledView` and asserts a repaint on a range change; `tests/ui/station-tabs.test.ts` asserts `CHART_SUBTABS` and passes `range` in its nav fixture; `tests/e2e/station-tabs.spec.ts` asserts exactly two chart sub-tab buttons and exercises them.

Test tooling: Vitest is Node-only (no DOM) so pure modules get unit tests; Playwright proves the DOM/gesture behaviour against the production build. All runs are Docker-only (`docker compose run --rm test ...`, `... e2e ...`, `... typecheck`, `... lint`). `tsconfig.json` includes `src/**` and `tests/**`, so a signature change is not green until every test call site is updated.
</interfaces>

<context>
@AGENTS.md
@.planning/quick/261109-lsz-add-mouse-wheel-zoom-and-drag-to-pan-to-/261109-lsz-CONTEXT.md
@src/ui/chart-model.ts
@src/ui/chart.ts
@src/ui/chart-draw.ts
@src/app/game-session.ts
@src/app/probe.ts
@index.html
@tests/e2e/helpers/chart.ts
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| pointer/wheel input → chart shell | Untrusted local DOM events (coordinates, wheel deltas, pointer ids) cross into gesture math. |
| shell → session | Gesture-derived camera objects cross into session state and the view builder. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261109-01 | Denial of service | chart.ts wheel/drag handlers | low | mitigate | Continuous wheel/drag paints coalesce through one requestAnimationFrame slot (no loop); wheel factor is clamped (0.5..2) and span is clamped to 20..256, so a delta flood cannot grow work without bound. |
| T-261109-02 | Tampering | chart-model.ts camera helpers | low | mitigate | `clampChartCamera` rejects non-finite values, clamps span to 20..256, and clamps centre so the view stays inside 0..256; the session re-clamps every incoming camera. A NaN screen point falls back to the previous camera. |
| T-261109-03 | Information disclosure | chart shell | low | accept | The chart renders only compiled static galaxy data; no network, no secrets, no DOM string interpolation (all text uses textContent/canvas fillText). No new disclosure surface. |
| T-261109-SC | Supply chain | dependency installs | low | accept | No package is added or installed; the change uses existing TypeScript, DOM and Canvas APIs only. |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Camera model, chart shell gestures, session/probe wiring, sub-tab removal, and mechanical call-site updates (tracer)</name>
  <files>src/ui/chart-model.ts, src/ui/chart.ts, src/ui/chart-draw.ts, src/ui/station-tabs.ts, src/ui/station-nav.ts, src/app/game-session.ts, src/app/probe.ts, src/input/actions.ts, index.html, README.md, tests/ui/chart-model.test.ts, tests/ui/chart-draw.test.ts, tests/ui/station-tabs.test.ts, tests/input/bindings.test.ts, tests/e2e/helpers/chart.ts, tests/e2e/hyperspace.spec.ts, tests/e2e/core-loop.spec.ts, tests/e2e/autosave.spec.ts, tests/e2e/station-tabs.spec.ts</files>
  <read_first>src/ui/chart-model.ts whole file; src/ui/chart.ts whole file; src/ui/chart-draw.ts whole file; src/ui/station-tabs.ts (StationNavState, CHART_SUBTABS); src/ui/station-nav.ts whole file; src/app/game-session.ts (the chart functions listed in interfaces, updateProbe, currentNavState, the createChart/createStationNav block, dispose); src/app/probe.ts (WegoliteChartProbe); src/input/actions.ts (ActionId, DEFAULT_BINDINGS, ACTION_LABELS, ACTION_CONTEXTS); index.html (#chart markup and CSS); tests/ui/chart-model.test.ts (all buildChartView calls and the fake ChartView); tests/ui/chart-draw.test.ts (labelledView and needsChartRepaint); tests/ui/station-tabs.test.ts (nav fixture and CHART_SUBTABS); tests/e2e/helpers/chart.ts; the four e2e specs listed; README.md (Galactic chart table).</read_first>
  <action>
Implements the locked decisions D-01..D-07 and D-09, D-10. Do not restate or weaken them.

1. src/ui/chart-model.ts — camera.
   - Remove `ChartRange`, the SHORT/LONG constants, `centreFor`, `spanFor`.
   - Add `export interface ChartCamera { readonly centre: ChartPoint; readonly spanX: number; }`, `CHART_LOCAL_SPAN_X = 80`, `CHART_GALAXY_SPAN_X = 256`, `CHART_MIN_SPAN_X = 20`, `CHART_GALAXY_CENTRE = { x: 128, y: 128 }`, and `chartSpanY(camera) = 2 * camera.spanX` (D-01). Document that the half-y span is a full spanX.
   - Add pure `clampChartCamera(camera)`: non-finite inputs fall back to the galaxy preset; spanX clamps to [20, 256]; per axis clamp the centre so the view stays inside the galaxy 0..256 extent — centre.x in [min(128, spanX/2), max(128, 256 - spanX/2)] and centre.y in [min(128, spanY/2), max(128, 256 - spanY/2)] with spanY/2 = spanX (D-05). `localPreset(system)` returns clampChartCamera of the system's chartX/chartY with spanX 80 (D-06). `galaxyPreset()` returns clampChartCamera of centre 128,128 and spanX 256.
   - Add `zoomChartCamera(camera, viewport, anchorScreen, factor)`: clamp factor to 0.5..2; map the anchor screen point to chart coordinates with the current projection scale; compute the new span; place the new centre so the same chart point stays under the anchor with the new scale; return clampChartCamera. Add `panChartCamera(camera, viewport, dxPixels, dyPixels)`: centre.x -= dxPixels/k, centre.y -= 2*dyPixels/k where k is the current projection scale, then clamp; dragging right moves the map right. Both are pure and deterministic.
   - Change `buildChartView(systems, currentId, targetId, camera, fuel, viewport, selectedId)` (same argument position). Clamp the camera first. Use centre = camera.centre, spanX = camera.spanX, spanY = 2*spanX. Project each marker once and set `visible` from its projected screen position inside the viewport rectangle (0..viewport.width, 0..viewport.height), which is D-02's "inside the current viewport" (on a matching-aspect viewport this is the camera window; letterboxing is respected). Off-screen current/target/selected still paint but are not hit-tested or arrow-selectable (D-02). Keep all 256 markers in the view. Keep the edge filter but generalise it: skip an edge only when both endpoints are invisible (at galaxy zoom every system is visible, so all 7 LY edges draw). `emptyChartView` takes the camera instead of the range.
   - In `ChartView`, remove `range: ChartRange`; keep `centre`, `chartSpanX` and `chartSpanY` as the single camera contract (the shell reconstructs a camera from them; no extra `camera` field).
   - Extend `selectLabels`: always accept current/target/selected. At `view.chartSpanX >= 128`, consider only the forced labels plus the 12 visible systems nearest the camera centre (squared chart distance, ties by systemIndex), which are the only non-forced candidates; below 128, keep today's collision culling over visible markers. This is D-08's "nearest few at far zoom, more as it zooms in", deterministic and DOM-free.

2. src/ui/chart-draw.ts — repaint and comments.
   - `needsChartRepaint` replaces the `range` comparison with centre.x, centre.y, chartSpanX and chartSpanY comparisons (D-09). Everything else stays.
   - Update the module and function comments that say "range" to say camera, and keep the static-painter language but note that the shell coalesces gestures; this module still never schedules a frame.

3. src/ui/chart.ts — gestures and rAF coalescing.
   - Extend `ChartOverlay` with `onCamera(handler: (camera: ChartCamera) => void): void`. Import `panChartCamera`, `zoomChartCamera` and the camera type from chart-model.js.
   - Own the gesture state in the shell closure: `pendingCamera: ChartCamera | undefined`, a `rafId`, drag state `{ pointerId, startX, startY, lastX, lastY, moved }`, and `suppressClick`. Every gesture reads its base camera from `pendingCamera`, else from the last received view's centre/chartSpanX. A candidate camera is computed per event and `scheduleFlush()` sets one requestAnimationFrame; the callback clears `rafId`, takes `pendingCamera`, clears it, and calls the camera handler. No continuous loop (D-09).
   - `wheel` on the canvas, registered non-passive with the AbortController signal: `preventDefault`; guard a missing current view; normalise deltaY by `deltaMode` (0 pixels, 1 lines times 16, 2 pages times the viewport height); compute `factor = clamp(pow(1.15, deltaY / 100), 0.5, 2)` so wheel-up zooms in; anchor at the pointer position converted to canvas CSS pixels; set `pendingCamera = zoomChartCamera(base, viewport(), anchor, factor)` and schedule. This is D-03; the model clamps span to 20..256.
   - `pointerdown` (left button only, button 0): guard a current view; record the drag with the pointer id and client coordinates; `canvas.setPointerCapture(pointerId)`. `pointermove`: only for the active pointer; compute the delta from the last position; set `moved` once total movement exceeds 3 CSS pixels; while moved, `pendingCamera = panChartCamera(base, viewport(), dx, dy)`, add a `dragging` class to the canvas, and schedule. `pointerup`, `pointercancel` and `lostpointercapture`: release capture, remove the class, end the drag, and if it moved set `suppressClick = true`. This is D-04.
   - `click`: if `suppressClick`, clear it and return; otherwise keep the existing hit-test selection so a plain click still selects. `show`: reset pending camera, cancel any rAF, clear the drag, remove the class. `hide` and `dispose`: same cleanup plus `cancelAnimationFrame`; `dispose` aborts the controller as today.
   - Update the header comment: the shell has no animation loop, but wheel/drag paints are coalesced with requestAnimationFrame; open/selection/resize remain immediate.

4. Chart header and CSS (index.html).
   - Remove the `div.station-subnav[data-station-subnav="chart"]` element from `#chart` (D-06). Keep the system title and the credits span.
   - Add `#chart-canvas { cursor: grab; }` and `#chart-canvas.dragging { cursor: grabbing; }` (D-04); keep the canvas fill. Update the CSS comment "paints on open/selection/range/resize" to "open/selection/camera/resize".
   - Run prettier on index.html afterwards.

5. src/ui/station-tabs.ts and src/ui/station-nav.ts — remove the chart sub-tabs.
   - station-tabs.ts: delete `CHART_SUBTABS` and the `ChartRange` import; remove `range` from `StationNavState`.
   - station-nav.ts: `SUBNAV_HOSTS` becomes `["status"]`; remove `onChartRange` from `StationNavHandlers`; build sub-nav buttons from `STATUS_SUBTABS` only; remove the `"short"|"long"` click branch and the `ChartRange` import; remove `state.range` from the sync cache key and the sub-button pressed logic (status keeps page).

6. src/app/game-session.ts — session camera ownership.
   - Replace the `ChartRange` import with `ChartCamera` types and `clampChartCamera`, `localPreset`, `galaxyPreset`.
   - Replace `chartRange` with `let chartCamera: ChartCamera = galaxyPreset();` and `let chartPreset: "local" | "galaxy" = "local";`.
   - `currentChartView` and the `setViewBuilder` closure pass `chartCamera` to `buildChartView`.
   - `openChart`: before building the first view, set `chartCamera = localPreset(system)` and `chartPreset = "local"` (D-06: open local; camera resets every open per the discretion choice).
   - New `setChartCamera(camera)`: guard `chartOpen`, set `chartCamera = clampChartCamera(camera)`, call `refreshChart()` and `updateProbe()`.
   - New `toggleChartPreset()`: guard `chartOpen`; if `chartPreset` is local, set galaxy and `chartCamera = galaxyPreset()`, else set local and `chartCamera = localPreset(system)`; call `refreshChart()` and `updateProbe()`. Delete `setChartRange`.
   - `applyChartAction` `case "chartRange"` now calls `toggleChartPreset()`; keep the action id and the context (D-07).
   - `currentNavState` drops `range`. Delete `setChartRange`. `createStationNav` drops the `onChartRange` handler. After `chart.onSelect`, add `chart.onCamera((camera) => { setChartCamera(camera); })`.
   - `updateProbe`: replace `range: chartRange` with `camera: { centre: { x: chartCamera.centre.x, y: chartCamera.centre.y }, spanX: chartCamera.spanX, spanY: 2 * chartCamera.spanX }`.

7. src/app/probe.ts: replace `range` on `WegoliteChartProbe` with `camera: { centre: { x: number; y: number }; spanX: number; spanY: number }` (D-10).

8. src/input/actions.ts: change `ACTION_LABELS.chartRange` from "Chart range" to "Chart preset" (D-07). Keep the id, default Tab binding and chart context. README.md: rename that table row's label from "Chart range" to "Chart preset" in the same commit so `tests/contract/readme.test.ts` stays green; do not add mouse rows to the table (the contract rejects rows with no bound action).

9. Mechanical test and helper updates so the tree typechecks. No new behavioural claims in this task; Task 2 owns those. In tests/ui/chart-model.test.ts replace every range argument with a camera (use exported `localPreset(system)` and `galaxyPreset()`, adding a small local `cameraFor` helper if it reads better), and remove `range` from the fake ChartView at the `viewForMarkers` helper. In tests/ui/chart-draw.test.ts change `labelledView`'s third parameter to a `ChartCamera` (default galaxy) and pass `localPreset(lave)` where it used "short"; change the repaint "range" case to a camera change. In tests/ui/station-tabs.test.ts remove the `CHART_SUBTABS` import and assertion and remove `range` from the nav fixture. In tests/e2e/helpers/chart.ts replace `range` in `ChartScreenOptions` with `camera: { centre: { x: number; y: number }; spanX: number }` and pass it to `buildChartView`. In the four e2e specs replace `range: probe.chart?.range ?? "short"` with `camera: probe.chart?.camera ?? { centre: { x: 128, y: 128 }, spanX: 256 }`; replace "wait for range long/short" with waits on `probe.chart?.camera.spanX === 256` (galaxy) or `=== 80` (local); in tests/e2e/station-tabs.spec.ts change the two-button chart sub-tab assertion to `toHaveCount(0)` and keep the test meaningful by waiting for the camera span instead (Task 2 rewrites the full chart portion). tests/input/bindings.test.ts keeps the action id and Tab expectations; update any exact label assertion only if one exists.

Commit source, tests and README together; leave the `.planning/REQUIREMENTS.md` and `.planning/PROJECT.md` edits to Task 3/the orchestrator. Run `docker compose run --rm lint npx prettier --write` on the changed source, HTML and test files before verifying.
  </action>
  <verify>
    <automated>docker compose run --rm typecheck && docker compose run --rm lint && docker compose run --rm test npx vitest run tests/ui/chart-model.test.ts tests/ui/chart-draw.test.ts tests/ui/station-tabs.test.ts tests/input/bindings.test.ts tests/contract/readme.test.ts</automated>
  </verify>
  <done>Typecheck, lint and the listed Vitest files pass in Docker. `ChartRange` is gone from the source; the model exports the camera, preset, clamp, zoom and pan helpers; the chart opens on `localPreset(system)`; Tab toggles local and galaxy; the Short/Long sub-tab markup, registry entry and nav handler are removed; the probe publishes the camera; the chart canvas has grab/grabbing cursors; and every TypeScript call site compiles against the camera API.</done>
</task>

<task type="auto">
  <name>Task 2: Behavioural proof — camera math, label policy and repaint unit tests plus browser zoom/pan/preset/sub-tab specs</name>
  <files>tests/ui/chart-model.test.ts, tests/ui/chart-draw.test.ts, tests/e2e/chart-gestures.spec.ts, tests/e2e/station-tabs.spec.ts</files>
  <read_first>src/ui/chart-model.ts (Task 1 output: clamp/zoom/pan, presets, buildChartView, selectLabels); src/ui/chart.ts (gesture and rAF implementation); tests/ui/chart-model.test.ts (existing style and fixtures); tests/ui/chart-draw.test.ts (recorder and labelledView); tests/e2e/station-tabs.spec.ts (boot and tab helpers); tests/e2e/hyperspace.spec.ts (openChart/clickSystem and marker point helpers); tests/e2e/helpers/chart.ts and tests/e2e/helpers/probe.ts.</read_first>
  <behavior>
    Pure camera (tests/ui/chart-model.test.ts):
    - `galaxyPreset()` is centre 128,128 spanX 256 and reports chartSpanY 512; `localPreset(lave)` is centred on Lave with spanX 80.
    - `clampChartCamera` clamps spanX below 20 to 20 and above 256 to 256; clamps the x centre so the visible window stays inside 0..256 (spanX 80 => 40..216) and the y centre using spanY/2 = spanX (spanX 80 => 80..176); pins the whole-galaxy centre to 128,128; replaces NaN/Infinity with the galaxy preset.
    - `zoomChartCamera` with factor < 1 shrinks the span around the anchor: a chart point placed under the anchor before the zoom is still under the anchor after, within 1e-9, for a grid of anchors; zoom never leaves 20..256; a factor of 0.1 or 100 is clamped before applying.
    - `panChartCamera` moves the centre opposite the pixel delta (drag right decreases centre.x), halves the y effect (2*dy/k), and clamps at the galaxy edge; a pan at the clamp is idempotent.
    - `buildChartView` with `localPreset(lave)` marks far systems invisible and near systems visible; with `galaxyPreset()` every system is visible; current/target/selected markers that are invisible still exist and have visible false; `hitTest` and `visibleSystemIds` skip them.
    - `selectLabels` at galaxy span returns at most 12 non-forced labels and always contains current/target/selected; at local span it returns the forced labels plus collision-culled visible names and can return more than 12; output is deterministic across two calls.
    - `needsChartRepaint` (tests/ui/chart-draw.test.ts) is true for a camera centre change, a spanX change and a spanY change, and false for two independently built identical camera views.
  </behavior>
  <action>
Adds the behavioural coverage Task 1 deliberately left out and rewrites the chart portion of the station-tabs browser spec.

1. Extend tests/ui/chart-model.test.ts with the camera, clamp, zoom anchor, pan, visibility and label-policy cases in the behavior block. Use exact float assertions where the maths is deterministic and a 1e-9 tolerance for the anchor round-trip. Keep the existing projection, edge, reachability, arrow and readout tests; only their camera arguments change.

2. Extend tests/ui/chart-draw.test.ts: assert `needsChartRepaint` true for a changed centre and changed span and false for an equal rebuilt camera view; keep the off-window selection paint tests using `localPreset(lave)`.

3. Create tests/e2e/chart-gestures.spec.ts for the browser proof (Chromium against the production build, 1280x720, no screenshots, no fixed sleeps; every wait is `waitForFunction` on the probe with a generous timeout and a `test.setTimeout(180_000)`). Use the `openChart` and marker helpers from tests/e2e/hyperspace.spec.ts or duplicate them locally as the repo does. Cover:
   - Open the chart docked (boot, launch or navigate as the existing specs do): `probe.chart.open` is true, the camera is the local preset (spanX 80, centre near the current system), and the Short/Long sub-tab buttons do not exist (`#chart .station-subnav` count 0).
   - Wheel zoom in: place the mouse at a visible marker's computed screen point, dispatch one wheel event with deltaY -120, wait for `probe.chart.camera.spanX` to drop below 80, then recompute that marker's screen point from the new probe camera and assert it is within 2 px of the anchor (D-03). Wheel out repeatedly and assert spanX clamps at 256. Wheel in repeatedly and assert it clamps at 20.
   - Drag pan: pointer down at the canvas centre, move right by 120 px and up by 60 px in steps, pointer up; wait for `probe.chart.camera.centre.x` to decrease and `centre.y` to change; assert the camera stayed inside the galaxy bounds. A drag must not change `probe.chart.selectedId`.
   - Click vs drag: a plain click on a marker's screen point selects it; a drag that starts on a marker and moves more than 3 px does not change the selection after pointer up (the click is suppressed).
   - Tab preset: Tab changes spanX 80 to 256 with centre 128,128; a second Tab returns to spanX 80 centred on the current system; the probe reports the camera each time.
   - Arrow/Enter/Esc unchanged: arrow keys still move the selection to a visible system, Enter commits `probe.chart.targetId`, Escape closes the chart.
   - Dock the assertions on the probe and on `data-paints` only; never compare pixels.

4. Rewrite the chart portion of tests/e2e/station-tabs.spec.ts (the "sub-tabs mirror the real Oolite sub-pages" test and the "in flight the chart opens without the station strip" test): keep the status sub-tab coverage; replace the chart Short/Long click/pressed assertions with Tab-driven `probe.chart.camera.spanX` 80/256 assertions and the absence of chart sub-tab buttons; keep the marker-click proof using the new camera-based `chartScreenPoint`. The in-flight test asserts the chart's station nav is hidden and that no chart sub-nav exists, instead of expecting two buttons.

Format the changed test files with `docker compose run --rm lint npx prettier --write` before verifying. Do not modify `src/` in this task unless a test uncovers a real defect; if it does, fix it and re-run Task 1's gate.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/ui/chart-model.test.ts tests/ui/chart-draw.test.ts && docker compose run --rm typecheck && docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/chart-gestures.spec.ts tests/e2e/station-tabs.spec.ts tests/e2e/hyperspace.spec.ts tests/e2e/core-loop.spec.ts"</automated>
  </verify>
  <done>The unit suite proves the camera clamp/zoom/pan maths, viewport visibility, the label budget and camera-driven repaint. The browser suite proves wheel zoom anchored under the cursor, drag panning and click suppression, Tab preset toggling, the absence of Short/Long buttons, unchanged arrow/Enter/Esc behaviour, and that the chart still opens in flight and docked. All runs are green in Docker.</done>
</task>

<task type="auto">
  <name>Task 3: Docs — README mouse-gesture note, REQUIREMENTS NAV-01 wording, PROJECT.md Key Decisions</name>
  <files>README.md, .planning/REQUIREMENTS.md, .planning/PROJECT.md</files>
  <read_first>README.md (the Galactic chart table and the prose around it); .planning/REQUIREMENTS.md (NAV-01 at line 78); .planning/PROJECT.md (the Key Decisions table tail and the file's date/updated note).</read_first>
  <action>
Records the behaviour and the deliberate divergences (D-11). No code changes.

1. README.md: below the Galactic chart table (not inside it, because the contract test treats every table row in Controls as an action row) add one short prose sentence: the chart opens on the local view around the current system, Tab toggles the whole-galaxy view, the mouse wheel zooms around the cursor, and dragging the left button pans. Keep the table row rename from Task 1 ("Chart preset | Tab"). Run prettier.

2. .planning/REQUIREMENTS.md: rewrite NAV-01 from "short/long range" to the camera wording — the F6 chart plots all 256 systems with continuous wheel zoom, drag panning and 7 LY connection lines; it opens on the local view around the current system and Tab toggles the whole-galaxy view. Leave the checkbox and the other NAV rows untouched.

3. .planning/PROJECT.md: add one Key Decisions row recording the camera model and presets. State that the chart is one continuous camera (centre + spanX, spanY = 2*spanX because the projection halves y), that the local preset is spanX 80 and the whole-galaxy preset is centre 128,128 spanX 256, that Tab keeps the `chartRange` action id but now toggles presets, that the minimum span is 20 (a deliberate Wegolite divergence from Oolite's 64-unit maximum-zoom width), that labels shrink to the nearest few at galaxy zoom, and that the camera resets to local on each open. Match the table's Decision | Rationale | Outcome columns and mark the outcome as this quick task. Do not edit the existing rows.

The executor commits README with the code change; leave the `.planning/` edits uncommitted for the orchestrator's documentation commit (quick-task Step 8).
  </action>
  <verify>
    <automated>docker compose run --rm lint && docker compose run --rm test npx vitest run tests/contract/readme.test.ts</automated>
  </verify>
  <done>The README controls table still matches ACTION_LABELS and labelFor, the prose documents wheel zoom, drag pan and the Tab preset; NAV-01 describes the camera and presets; PROJECT.md records the camera decision and the span-20 divergence; lint and the README contract test pass in Docker.</done>
</task>

</tasks>

<verification>
- `docker compose run --rm typecheck` and `docker compose run --rm lint` are green after Task 1 and stay green.
- The chart opens at the local preset; Tab yields the galaxy preset; no Short/Long buttons remain in `#chart`.
- Wheel zoom and drag pan repaint through the coalesced camera path; a plain click still selects; arrows, Enter and Escape are unchanged.
- `tests/ui/chart-model.test.ts` and `tests/ui/chart-draw.test.ts` cover the camera clamp/zoom/pan, visibility, label budget and repaint.
- `tests/e2e/chart-gestures.spec.ts` and the updated `tests/e2e/station-tabs.spec.ts` pass in the browser container, and the existing hyperspace/core-loop/autosave specs pass with the camera-based helper.
- The probe camera is the single source the e2e helper reads; no spec uses a fixed short/long range.
</verification>

<success_criteria>
- The F6 chart is continuously zoomable (spanX 20..256) under the cursor and pannable by left-button drag, clamped to the galaxy.
- Local and whole-galaxy survive as presets with Tab; the sub-tab buttons are gone.
- Off-window current/target/selected markers still paint and label; hit-testing and arrow navigation use only visible markers.
- Labels thin to the nearest few at far zoom and fill in as the view zooms.
- The probe exposes the camera; tests, helper and docs are consistent.
- All gates run in Docker.
</success_criteria>

<output>
Create `.planning/quick/261109-lsz-add-mouse-wheel-zoom-and-drag-to-pan-to-/261109-lsz-SUMMARY.md` when done.
</output>
