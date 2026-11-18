---
phase: quick
plan: 261118-cyo
subsystem: ui
status: complete
tags: [station, market, manifest, status, chart, find-planet, fidelity]
requires: []
provides:
  - F8 market sort by column heading (session state, keys and trades follow the sorted order)
  - Oolite credit digit grouping (U+00A0, groups of 3 from 5 integer digits)
  - Oolite market cash-and-load line; 17 rows fit at 1280x720
  - Oolite manifest lines; Status page 1 with the equipment list beside the fields
  - Chart title "Galactic Chart N"; sun-coloured, planet-sized markers; collision-free labels; Find planet
affects: [src/ui, src/app/session, src/input, src/sim/player/profile.ts, index.html]
tech-stack:
  added: []
  patterns:
    - "optional StationShell sink (onMarketSort?) wired through game-session and start-session, like setStationPage"
    - "chart shell event union (ChartFindEvent) routed to a guarded controller sink (handleFind)"
key-files:
  created: []
  modified:
    - src/ui/station-model.ts
    - src/ui/station.ts
    - src/sim/player/profile.ts
    - src/app/session/station-controller.ts
    - src/app/session/context.ts
    - src/app/session/chart-controller.ts
    - src/app/session/start-session.ts
    - src/app/game-session.ts
    - src/ui/chart-model.ts
    - src/ui/chart-draw.ts
    - src/ui/chart.ts
    - src/ui/station-hints.ts
    - src/input/actions.ts
    - src/input/bindings.ts
    - index.html
    - README.md
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
    - tests/contract/fidelity.test.ts
decisions:
  - "Sort the F8 market by clicking a column header (owner 2026-11-18): ascending, descending, default; ties in catalogue order; Legal not sortable; session state only"
  - "Show no dashboard under the docked screens (owner 2026-11-18)"
  - "Find planet on the galactic chart through a text box focused by / (owner 2026-11-18); a no-match keeps the text"
  - "Keep the 7 ly jump graph on both chart presets (owner 2026-11-18)"
  - "FIDELITY id patterns widened to E-\\d{2,3} because E-100 was the next free id"
  - "The manifest is cited as two FIDELITY rows (header E-101, goods/none E-102) because one 20-line range cannot cover PlayerEntityContracts.m:1058-1083"
  - "A forced chart label (current, target, selection) moves to the first free corner around its marker instead of overprinting another forced label"
metrics:
  duration: "about 75 min"
  completed: 2026-11-18
  tasks: 3
  files: 34
estimate:
  tokens: 180000
actuals:
  tokens: 48000
  tasks: 3
  commits: 4
plan_head_before: f23d386fea2f243c129ee954a928090a06f6d1c4
plan_head_after: c9a689c701394b870a041e50e0ebd1bb910e5dfd
---

# Phase quick Plan 261118-cyo: Station screens and chart closer to Oolite Summary

The F8 market sorts by a heading click and fits all 17 goods with Oolite's "Cash: 100.0 ₢. Load 0 of 20 t." line at 1280x720. Credits group as Oolite does with U+00A0. The F5 manifest prints Oolite's cargo, cabin and "No cargo carried." lines, and page 1 shows the equipment list. The chart reads "Galactic Chart 1", draws Oolite's sun-coloured, planet-sized blobs, never overprints labels and has a keyboard-driven Find planet box.

Ordering note: quick task 261118-cyn (flight HUD) had not run yet, so this task ran first. The FIDELITY id patterns were widened here (E-99 was the last two-digit id). cyn should take its ids after E-107.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 | 07e5a22 | feat(quick-261118-cyo): sort the F8 market by clicking a column heading |
| 2 | c2399a0 | feat(quick-261118-cyo): station screens and chart header as Oolite |
| 3 | 2075e63 | feat(quick-261118-cyo): Oolite chart markers, collision-free labels and Find planet |
| 3 (fix from the visual check) | c9a689c | fix(quick-261118-cyo): move a forced chart label aside instead of overprinting |

## What was built

- **Task 1, market sort (tracer).** `src/ui/station-model.ts` adds `MarketSort`, `MARKET_SORT_COLUMNS`, `isMarketSortColumn`, `nextMarketSort` and `sortMarketGoods`. These are Oolite's comparators (`PlayerEntity.m:11868-11911` at 7437f22): a code-unit name compare, mass unit t<kg<g, price, stock and hold. The sort is stable, and descending negates the comparator, so ties keep the catalogue order. `buildMarketModel` takes an optional trailing sort and marks the columns with `sortable` and `sort`. `ctx.station.marketSort` is session state only: it is not saved and not on the probe. `sortMarket(column)` repeats `setStationPage`'s guards and accepts only the allow-list. `selectableKeys` and `ensureSelection` walk the sorted order. The selection and a pending `[Y/N]` plan are keyed by commodity, so a re-sort never retargets them; a unit test confirms that a re-sorted pending plan trades the same commodity. The market thead has one delegated click listener under the shell's AbortController. Headings show " ▲" or " ▼" and `aria-sort`.
- **Task 2, station screens and chart header.** `groupIntegerDigits` in `src/sim/player/profile.ts` drives `formatDecicredits`, which `formatCredits` delegates to, and `formatWholeCredits`. `MarketModel.cashLoadText` is Oolite's `market-cash-and-load` sentence. `StatusModel` now has `cargoText`, `cabinsText`, held-only `manifest` rows (`"3 t × Food"`) and `emptyText`. The hover-card inhabitants field has an empty label. `chartTitle(galaxyIndex)` and `ChartOverlay.setTitle` give the chart its title. In `index.html`, the market has one `market-cash-load` paragraph, and the market-scoped CSS tightens rows, the heading and the padding. Status page 1 is a two-column grid with an "Equipment" heading, hidden when the list is empty. Page 2 holds the cargo and cabin line, a `ul[data-manifest-rows]` and `manifest-empty`.
- **Task 3, chart.** `chartMarkerRadius(radiusKm, spanX, scale)` gives a diameter in chart-x units of `max(0.5 x zoom, 1 + 0.0017 x radius) x 64 / 480` with `zoom = spanX / 64`. A unit test checks that it equals Oolite's `blob_size / 2` under Oolite's own scale. `chartMarkerColor(sun_color)` applies OOColor's /255 rule. The painter fills each blob in its sun colour, at alpha 0.45 when unreachable. It strokes rings for current, target and selection at `max(r + 2.5, 4.5)` px and outlines Find matches with a green square. `selectLabels` places labels in this order: forced, then found matches, then candidates (the 12 nearest at galaxy zoom). Each box includes a 3 px descender and a 2 px margin, and the output stays in system-index order. Find planet adds `findSystemsByPrefix` (trim, 16-character cap, lower-cased prefix, index order) and `chartFindReadout`. `buildChartView` takes optional `foundIds`, and `needsChartRepaint` compares them. The session gains `chartFindQuery`, `chartFindMatches` and `chartFindIndex`. `handleFind` handles query, step, commit and clear with `setChartCamera`'s guards: it centres an off-view match without changing the span and wraps when stepping. The shell's `focusFind`, `resetFind`, `setFindResult` and `onFind` drive the "Find planet:" input (maxlength 16, autocomplete off, spellcheck false). Enter commits and blurs; Escape clears and blurs; `hide()` blurs. A new action `chartFind` is bound to Slash in the chart context and labelled "Find planet". `CODE_LABELS` gains Slash "/", and the chart hints gain "/: find". The README Controls table gains a row and a sentence.

## Discretion choices (as the plan asked)

- Sort cycle: ascending, then descending, then default on the same heading; a different heading starts ascending. Ties stay in catalogue order in both directions. Commodity, Unit, Price, Stock and Hold are sortable; Legal is not. No key sorts. The sort is not saved.
- The market load line is Oolite's exact sentence in one paragraph; the separate cash and load paragraphs are gone.
- Status page 1 has two columns: the fields on the left, and on the right an "Equipment" heading (no colon) over the list. The status-page load line is gone; page 2 carries Oolite's cargo line instead.
- Marker size follows Oolite's blob mapping above. The 0.5 floor is implemented and tested, though it never binds for real radii. At the galaxy preset (1280x503 canvas, scale 1.96 px per chart unit) the dots are about 1.5 to 3.3 px across.
- State rings use the existing CHART_CURRENT_COLOR, CHART_TARGET_COLOR and CHART_SELECTED_COLOR. Unreachable markers keep their sun colour at alpha 0.45. Found matches get a green (#00ff00, Oolite's `kGuiChartMatchBoxColor` default) square. The 7 ly graph and the label colours are unchanged.
- Labels: forced first, then found, then candidates. Every box includes the descender and a 2 px margin, and a non-forced label that collides is skipped. A forced label that would collide tries the other three corners (deviation 2 below).
- Find planet: `/` focuses the box. The query is trimmed and capped at 16. A no-match keeps the text and shows "No match"; the readout otherwise reads "n of m". Every chart open starts empty.
- Manifest FIDELITY: two rows (E-101 header 1058-1066, E-102 goods/none 1068-1083), because the header and `manifest-none` lines are 24 apart.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test expectation for 8 kg of Gold**
- **Found during:** Task 2 (red test run)
- **Issue:** My new manifest test expected "Cargo 4 t (20 t)" for 3 t Food plus 8 kg Gold. `podsFor` puts up to 499 kg in the safe, so 8 kg takes no pod.
- **Fix:** The expectation is now "Cargo 3 t (20 t)", as the hold counts it; the code was right.
- **Commit:** c2399a0

**2. [Rule 1 - Bug] Two forced chart labels overprinted each other**
- **Found during:** Task 3 visual check (`chart-find-dis.png`, galaxy preset)
- **Issue:** Lave (current) and Diso (selected) sit 9 px apart at the galaxy preset and drew "Disbave". The plan's rule placed every forced label unconditionally, which breaks the must-have "no two chart labels overlap at any zoom".
- **Fix:** A forced label that would meet a placed box takes the first free corner around its marker: right-above, left-above, right-below, then left-below. It keeps its usual place only when all four are taken. A new unit test pins the Lave and Diso case.
- **Files:** src/ui/chart-model.ts, tests/ui/chart-model.test.ts
- **Commit:** c9a689c

**3. [Test data] The Find planet e2e test types "la" instead of "dis"**
- "dis" matches only Diso in galaxy 1, so it cannot show Down stepping to a second match. "la" matches Lave, Laenin, Larais and Laeden. The handleFind unit tests use "la" for the same reason. The visual check still captures "dis".

**4. [Plan assumption] Ordering**
- The plan assumed that 261118-cyn ran first. It did not, so this task widened the FIDELITY id patterns (`ROW_HEADING` and `EXCERPT_CELL` to `E-\d{2,3}`, existing ids unchanged) and took E-99 to E-107.

## Re-pinned values (each with its traced cause)

- `tests/ui/station-status.test.ts`: `formatDecicredits(123_456_789)` changed from "12345678.9 ₢" to "12 345 678.9 ₢", and both `MAX_SAFE_INTEGER` strings now carry U+00A0 groups. Cause: Oolite's digit grouping (`oolite-locale-functions.js:60-92`, `descriptions.plist:80-83`).
- `tests/ui/station-status.test.ts` manifest: the 16-row table and `loadText` "Load 0 of 20 t" / "Load 3 of 30 t" became `cargoText` "Cargo 0 t (20 t)" / "Cargo 3 t (30 t)", `cabinsText`, held-only rows and `emptyText`. Cause: Oolite's manifest lines (`PlayerEntityContracts.m:1058-1083`, `descriptions.plist:1587, 1916-1919`).
- `tests/ui/station-market.test.ts`: `cashText` "Cash: 100.0 ₢." plus `loadText` "Load 0 / 20 t" became `cashLoadText` "Cash: 100.0 ₢. Load 0 of 20 t."; likewise "Cash: 92.4 ₢. Load 2 of 20 t.". Cause: Oolite's `market-cash-and-load` (`descriptions.plist:1635`, `PlayerEntity.m:9979-9986`).
- `tests/ui/station-system-data.test.ts`: the inhabitants field label changed from "Inhabitants" to "". Cause: `sysdata-line-8` "\t([inhabitants])" (`descriptions.plist:1693`).
- `tests/e2e/station.spec.ts`: `market-load` "Load 1 / 20 t" became `market-cash-load` "Cash: 96.2 ₢. Load 1 of 20 t." (computed from the price). On F5 page 2, the 16 `tr` rows and "Load 0 of 20 t" became the cargo, cabins and "No cargo carried." lines with 0 `li`. The gold, gem and alien row checks are dropped because the manifest no longer lists empty goods. Causes as above.
- `tests/ui/station-hints.test.ts`: `chartHints` gains "/: find" before the commit hint. Cause: the new `chartFind` binding.
- `tests/input/bindings.test.ts`: `chartFind` is added to the chart-only action list. Cause: the new action.
- `FIDELITY.md` E-103: the Wegolite cell moved from `chart-model.ts:159` to `:170` because Task 3 added the blob constants above `chartTitle`.

## Gate results

| Gate | Where | Snapshot | Result |
| ---- | ----- | -------- | ------ |
| Task 1 targeted Vitest, typecheck, lint, grep gates | local | working tree before 07e5a22 | pass (54 tests), GATES_OK |
| Task 1 e2e `station.spec.ts -g sort` | remote | 07e5a22 | `exit=0 elapsed=7s snapshot=07e5a22` (1 passed) |
| Task 2 targeted Vitest (8 files), typecheck, lint, grep gates | local | before c2399a0 | pass (172 passed, 1 skipped), GATES_OK |
| Full fast unit suite after Task 2 | local | before c2399a0 | 220 files, 5699 passed, 10 skipped |
| FIDELITY contract with the pinned tree (`OOLITE_SRC`, verbatim excerpts) | local | Task 2 and Task 3 | 9 of 9 passed, 0 skipped |
| Task 2 e2e `station.spec.ts chart-gestures.spec.ts` | remote | c2399a0 | `exit=0 elapsed=42s snapshot=c2399a0` (19 passed) |
| Task 3 targeted Vitest (7 files incl. readme and fidelity), typecheck, lint, grep gates | local | before 2075e63 | 191 passed, GATES_OK |
| Final `docker compose run --rm test` | local | c9a689c | exit=0; 220 files, 5730 passed, 10 skipped |
| Final `docker compose run --rm lint` | local | c9a689c | exit=0 |
| Final `docker compose run --rm typecheck` | local | c9a689c | exit=0 |
| Final e2e `chart-gestures.spec.ts station.spec.ts station-tabs.spec.ts` | remote | c9a689c | `exit=0 elapsed=55s snapshot=c9a689c` (34 passed) |
| `verify-full` | remote | c9a689c | `exit=0 elapsed=607s snapshot=c9a689c` (Chromium e2e 140 passed in 7.9 min, seams 2 passed; no flaky retries) |

The label-overlap test was confirmed red before the change. A scratch Vitest under `/tmp/cyo-scratch` ran against the old `selectLabels` with Lave current, Zadies target and Sotiqu selected at 1280x503 and found one overlap, `g0-s42`/`g0-s131` (Anarlaqu and Zadies). Traced cause: the forced label Zadies (index 131) was placed without a collision test after the candidate Anarlaqu (index 42), and the boxes had no descender.

NPC acceptance run: not due. `git diff --stat f23d386..HEAD -- src/sim/npc src/sim/world src/content/generated` is empty, so neither the 20-seed run nor the content drift check applies.

## Visual check (remote, 1280x720, Chromium, new commander at Lave)

The scratch spec was `/tmp/cyo-visual/zz-cyo-visual.spec.ts`. The shots and `capture.json` are in `/tmp/cyo-visual/out/`: `market.png`, `market-sorted-price.png`, `status.png`, `manifest-empty.png`, `manifest-food.png`, `chart-local.png`, `chart-galaxy.png`, `sysdata.png`, `chart-find-dis.png` and `chart-find-la.png`. They were captured at c9a689c, and an earlier run at 2075e63 found deviation 2. The remote scratch directory was removed through a busybox container, and nothing from /tmp is tracked.

- **Market against Oolite `02-market.png`.** Now matching: all 17 rows and the one line "Cash: 100.0 ₢. Load 0 of 20 t." under the table without scrolling (last row bottom 542.7 px, line bottom 572.7 px, `#station-screen` bottom 604.6 px, scrollHeight 502 = clientHeight 502); the Legal values; ₢. Sorted by Price, the heading reads "Price ▲" and the rows run Food 3.8, Textiles 6.3, Minerals 11.4 and so on. Still different (decided or out of scope): no "Filter:" line (decided, not to fix); Oolite's sort is shown as a "Sort:" text line where Wegolite uses the heading arrow; Oolite has no Unit column and puts the unit after Stock and Hold; the palette (decided); the dimmed out-of-stock rows (R3, palette todo); and the random market values.
- **Status against Oolite `01-status.png`.** Now matching: the equipment list sits on the same screen as the fields (last item bottom 350.6 px, no scroll). Still different: Wegolite lists "Missile ×3" where Oolite shows the missiles only on the dashboard; there is no red title or rule (palette, decided); the rating shows "Harmless (0)" with one space because HTML collapses Oolite's three spaces (pre-existing, not in this plan); and the tab strip and page indicator (decided).
- **Manifest against Oolite tracer `01-status.png` (Ship's Manifest).** Now matching: "Cargo 0 t (20 t)", "Passenger Cabins 0 / 0" and "No cargo carried." for a new commander; after buying 2 t, "Cargo 2 t (20 t)" and "2 t × Food". Still different: Oolite draws the goods in two columns and the cabins column further right; the palette (decided).
- **Hover card against Oolite `03-sysdata.png`.** Now matching: "(Human Colonials)" sits in the value column under "2.5 Billion" with no label. The other values were already equal.
- **Local chart against Oolite `04-chart-short.png`.** Now matching: "Galactic Chart 1"; each system is drawn in its sun colour (Diso salmon, Zaonce blue, Lave white, Reorte pale yellow) and sized by its planet radius. Still different: the 7 ly graph (decided, kept); green labels and a ringed white disc where Oolite has yellow labels and a cross cursor (decided, colours stay); Wegolite's wider local span (decided).
- **Galaxy chart against Oolite `05-chart-galactic.png`.** Now matching: sun-coloured dots at Oolite's size; no overlapping labels; the green found boxes. Still different: Oolite's galactic chart shows no names, while Wegolite keeps its 12 nearest-centre labels plus the forced and found ones (decided label thinning); the graph (decided); and Oolite's "Find planet:" prompt sits under the chart where Wegolite puts the box in the header.
- **Find planet.** "dis" selects Diso, reads "1 of 1" and boxes it. "la" reads "1 of 4", selects Lave and boxes all four, with Laenin and Larais labelled. Laeden's label is skipped because it would meet Larais's, which is the owner's skip rule.

## Known limitations

- `/` focuses the box through the chart action queue, so the focus lands on the next frame. Keys typed in the same frame as `/` are dropped; the e2e test and the visual spec wait for the focus. Making the focus synchronous would need a keyboard-layer sink like `onStationScreen`, which was out of scope.
- At most three forced labels exist. If all four corners of a forced label are taken, it keeps its usual place, which is the only case where two labels can still meet.

## Known Stubs

None.

## Threat Flags

None. The new surfaces are the ones in the plan's threat model: the heading click sink (T-cyo-01 and T-cyo-02, allow-list and guards with unit tests) and the Find planet input (T-cyo-03 to T-cyo-05: maxlength 16 plus the model cap, `textContent` only, blur on Enter, Escape and hide).

## Self-Check: PASSED

- Commits 07e5a22, c2399a0, 2075e63 and c9a689c are ancestors of HEAD; `git rev-list --count f23d386..HEAD` is 4.
- Both todos are in `.planning/todos/completed/`; PROJECT.md has the four new Key Decisions rows; FIDELITY.md mentions 261118-cyo.
- No scratch file (`zz-cyo*`, `/tmp/cyo-*`) is tracked; the remote `/tmp/cyo-visual` is removed.
- SUMMARY.md, STATE.md and the PLAN files are left uncommitted for the orchestrator. ROADMAP.md is untouched. An untracked `.planning/todos/pending/2026-11-18-outfitting-bargain-tech-days.md` showed up during the run; it is not from this task and was left alone.
