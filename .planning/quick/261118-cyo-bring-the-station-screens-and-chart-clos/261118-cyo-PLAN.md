---
phase: quick
plan: 261118-cyo
type: execute
wave: 1
depends_on: []
files_modified:
  - index.html
  - README.md
  - src/sim/player/profile.ts
  - src/ui/station-model.ts
  - src/ui/station.ts
  - src/ui/chart-model.ts
  - src/ui/chart-draw.ts
  - src/ui/chart.ts
  - src/ui/station-hints.ts
  - src/input/actions.ts
  - src/input/bindings.ts
  - src/app/session/context.ts
  - src/app/session/station-controller.ts
  - src/app/session/chart-controller.ts
  - src/app/session/start-session.ts
  - src/app/game-session.ts
  - tests/ui/station-market.test.ts
  - tests/ui/station-status.test.ts
  - tests/ui/station-system-data.test.ts
  - tests/ui/station-hints.test.ts
  - tests/ui/chart-model.test.ts
  - tests/ui/chart-draw.test.ts
  - tests/app/session/station-controller.test.ts
  - tests/app/session/chart-controller.test.ts
  - tests/contract/fidelity.test.ts
  - tests/e2e/station.spec.ts
  - tests/e2e/chart-gestures.spec.ts
  - CHANGELOG.md
  - FIDELITY.md
  - .planning/PROJECT.md
  - .planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md
  - .planning/todos/pending/2026-11-17-ui-chart-differences-from-oolite.md
autonomous: true
requirements: [ECON-04, ECON-06, NAV-01, NAV-02]

estimate:
  tokens: 180000
  raw_tokens: 180000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "At 1280x720 the F8 market shows all 17 rows and, under the table, Oolite's line 'Cash: 100.0 ₢. Load 0 of 20 t.' without scrolling (descriptions.plist market-cash-and-load, PlayerEntity.m:9979-9986); every credit amount with 5 or more integer digits is grouped in threes with U+00A0, e.g. '10 000.0 ₢' (oolite-locale-functions.js:60-92, descriptions.plist:80-83) (STN-1)."
    - "Clicking the Commodity, Unit, Price, Stock or Hold heading sorts the market ascending by that column with Oolite's comparators (name, mass unit t<kg<g, price, quantity in stock, quantity in hold; PlayerEntity.m:9612-9628, 11868-11911), a second click reverses it, a third click restores the default order; the active heading shows ▲ or ▼ and aria-sort; Up/Down and buy/sell work on the sorted order, and a pending [Y/N] confirmation is never retargeted (SORT-1)."
    - "F5 page 2 shows 'Cargo N t (C t)', 'Passenger Cabins 0 / B' and only the goods held as 'N u × Name' in market order, or 'No cargo carried.' (PlayerEntityContracts.m:1060-1081, descriptions.plist manifest strings); F5 page 1 shows the Equipment list without scrolling at 1280x720 (STN-2)."
    - "The chart header reads 'Galactic Chart N' for galaxy index N-1 (GuiDisplayGen.m:1541); each marker is filled with its system's sun colour and sized by Oolite's blob formula max(0.5, (1 + 0.0017 x radius) / zoom) mapped through Oolite's 480-unit GUI over 64 x zoom chart units (GuiDisplayGen.m:1788-1791, 1846-1860); current, target and selection stay distinguishable; no two chart labels overlap at any zoom; the hover card prints '(Human Colonials)' under the population with no label (descriptions.plist sysdata-line-8) (CHART-1)."
    - "Pressing / on the chart focuses a 'Find planet:' box; typing selects the first system, in system-index order, whose lower-cased name starts with the lower-cased text (Universe.m:7745-7771), marks every match, centres the camera on an off-view match, Down/Up cycle the matches with wrap (GuiDisplayGen.m:2119-2160), Enter commits the selection as the hyperspace target, Escape clears the search; P and Esc typed in the box neither pause nor close the chart (FIND-1)."
    - "Both UI todos mark every item done or decided and move to .planning/todos/completed/, FIDELITY.md gains the new rows, ledger rows and the updated 261117-nfn Open items bullet, PROJECT.md gains the four Key Decisions rows, CHANGELOG [Unreleased] describes each change, the remote visual check is recorded in the SUMMARY, and local test, lint, typecheck plus remote verify-full pass on the committed HEAD (DOC-1)."
  artifacts:
    - path: "src/ui/station-model.ts"
      provides: "MarketSort, nextMarketSort, sortMarketGoods, buildMarketModel with sorted rows and cashLoadText, StatusModel with cargoText, cabinsText, held-only manifest and emptyText, hover-card inhabitants row with an empty label"
      contains: "sortMarketGoods"
    - path: "src/sim/player/profile.ts"
      provides: "formatDecicredits and formatCredits with Oolite's digit grouping (U+00A0, groups of 3 from 5 integer digits)"
      contains: "\\u00a0"
    - path: "src/app/session/station-controller.ts"
      provides: "sortMarket(column) with the setStationPage guards; selectableKeys and ensureSelection on the sorted order"
      contains: "sortMarket"
    - path: "src/ui/chart-model.ts"
      provides: "chartTitle, chartMarkerRadius (Oolite blob), marker sun colour, findSystemsByPrefix, buildChartView foundIds, collision-free selectLabels"
      contains: "0.0017"
    - path: "src/app/session/chart-controller.ts"
      provides: "handleFind (query, step, commit, clear), chartFind action, title on open"
      contains: "chartFind"
    - path: "src/input/actions.ts"
      provides: "chartFind action bound to Slash in the chart context, labelled Find planet"
      contains: "chartFind"
  key_links:
    - from: "src/ui/station.ts"
      to: "src/app/session/station-controller.ts"
      via: "the market thead click sink onMarketSort is wired in start-session to sortMarket"
      pattern: "onMarketSort"
    - from: "src/app/session/station-controller.ts"
      to: "src/ui/station-model.ts"
      via: "selectableKeys and ensureSelection walk sortMarketGoods(...) so keys follow the painted order"
      pattern: "sortMarketGoods\\("
    - from: "src/ui/chart.ts"
      to: "src/app/session/chart-controller.ts"
      via: "the Find planet box events reach handleFind through start-session"
      pattern: "onFind"
    - from: "src/ui/chart-model.ts"
      to: "src/ui/chart-draw.ts"
      via: "the painter fills each marker with marker.color at marker.radius"
      pattern: "marker\\.color"
    - from: "src/input/actions.ts"
      to: "src/app/session/chart-controller.ts"
      via: "applyChartAction case chartFind focuses the Find planet box"
      pattern: "chartFind"
---

<objective>
Bring the docked station screens and the F6 chart closer to Oolite, per the owner's locked decisions of 2026-11-18 on the two todos from quick task 261117-nfn.

Purpose: the market hides its load line and 6 of 17 rows below the fold and cannot be sorted, the manifest lists 16 empty goods, the equipment list is below the fold, credits are not digit-grouped, and the chart has no galaxy number, uniform markers, overlapping labels, a labelled inhabitants row and no planet search.

Owner decisions (locked, 2026-11-18). DO: market load line and all 17 rows at 1280x720; market sort by clicking a heading (ascending, reverse, default; indicator in the heading; keys and trades follow the sorted order; no filter); Oolite's manifest lines; the equipment list on status page 1; credits grouped as Oolite with U+00A0 in formatDecicredits and formatCredits; chart title "Galactic Chart N"; markers coloured by sun colour and sized by Oolite's formula; galaxy-zoom labels without overlaps (skip a label that collides with one already placed); "(Human Colonials)" under the population with no label; a keyboard-friendly planet-name search. DECIDED, not to fix: no docked dashboard strip; station and chart colours stay for now (yellow labels, cross cursor, palette); keep the 7 ly jump graph.

Oolite facts, verified by the planner in `/home/opencode/git/oolite`. Line numbers are at the pin `7437f22` (`git -C /home/opencode/git/oolite show 7437f22:<path>`); the checkout HEAD (21978c3) shifts descriptions.plist by about 12 lines, so FIDELITY excerpts and citations must come from the pin:
- Credits. `Resources/Scripts/oolite-locale-functions.js:43-48` reads `number-group-threshold` 5, `number-group-size` 3 and `number-group-separator`; `:60-92` groups the integer digits from the right in threes when there are at least 5 of them (`digitCount >= minSepDigits`), otherwise leaves them. `descriptions.plist:80-83`: size 3, threshold 5, decimal ".", separator U+00A0 ("Non-breaking space"). So 9999.9 stays "9999.9 ₢" and 10000.0 is "10 000.0 ₢".
- Market line. `descriptions.plist:1635` `market-cash-and-load` = "Cash: [credits|dcr]. Load [currentCargo] of [cargoCapacity] t."; `PlayerEntity.m:9979-9986` fills it with `current_cargo` and `maxAvailableCargoSpace` (`max_cargo - equipment_weight`, which Wegolite's `capacityPodsFor` already models with 5 t per berth).
- Sorters. `PlayerEntity.m:9612-9628` `applyMarketSorter`; `:11868-11911` comparators are all ascending: name (`NSString compare:`, a literal code-unit compare), price, quantity in the market, quantity in the hold, mass unit (`OOTypes.h` order UNITS_TONS, UNITS_KILOGRAMS, UNITS_GRAMS). Oolite cycles them with `/` (`PlayerEntityControls.m:459`) and has no legality sorter.
- Manifest. `PlayerEntityContracts.m:1060-1066` header row "Cargo [current] t ([max] t)" and "Passenger Cabins [current] / [max]" (`descriptions.plist:1918-1919`), current cabins = passengers aboard (always 0 in Wegolite), max = berths; `:1068-1082` the goods in two columns or `manifest-none` " No cargo carried." (`descriptions.plist:1916`). Each good is `manifest-cargo-quantity` " [quantity] [units] × [commodityName]" (`descriptions.plist:1587`); the extended "(n TC)" form needs scooped containers, which a docked hold never has, so it is not used. `PlayerEntity.m:7390-7425` lists held goods in market order.
- Status. `descriptions.plist:1587` area: `status-equipment` "Equipment:" heads the list on the same screen as the fields.
- Chart. `GuiDisplayGen.m:1541` title `long-range-chart-title-d` "Galactic Chart %d" with `galaxy_number + 1`. `:1788-1791` `blob_size = (1 + 0.0017 * radius) / zoom`, floored at 0.5, drawn as a filled oval whose size is the diameter (`OOOpenGL.m:132-147`). The GUI is `MAIN_GUI_PIXEL_WIDTH` 480 wide (`GuiDisplayGen.h:39`) and spans `CHART_WIDTH_AT_MAX_ZOOM * zoom` = 64 x zoom chart-x units (`GuiDisplayGen.m:1574`, `PlayerEntity.h:94-97`, CHART_MAX_ZOOM 4 = the galactic chart). `:1846-1860` default mode SUNCOLOR: the fill is the system's `sun_color` (0..1 components unless one exceeds 1, then /255, `OOColor.m:213-231`). `:1874-1925` found systems get a green square box and, at galactic zoom, their name.
- Search. `PlayerEntityControls.m:1836-1856`: typed text is lower-cased; `Universe.m:7745-7771` marks every system whose lower-cased name has that prefix and returns the first in index order; each keystroke targets the first match (`targetNewSystem:0`), moving the chart to it; a keystroke that leaves no match clears the typed string. `GuiDisplayGen.m:2119-2160` `targetNextFoundSystem` steps +1/-1 through the matches with wrap (Shift+Left/Right, `PlayerEntityControls.m:2008-2030`). In Oolite the chart selection is the hyperspace target; in Wegolite selection and commit are separate (Enter commits).
- Hover card. `descriptions.plist:1692-1693` `sysdata-line-7` "[sysdata-pop]\t[populationDesc]" and `sysdata-line-8` "\t([inhabitants])": the inhabitants sit in the value column with no label.
- Content: `src/content/generated/systems/g0.json` already carries `galaxy`, `radiusKm` (2828..6909) and `sun_color` (0..1; Diso 0.82/0.52/0.46, Zaonce 0.28/0.32/0.84, Lave white), matching Oolite's screenshot. No content-build change and no drift check is needed; confirm with `rg -n "sun_color|radiusKm|galaxy" src/content/schemas/system.ts`.

Discretion choices (record each in the SUMMARY):
- Sort cycle on the same heading: ascending, descending, default; a different heading starts ascending. Ties keep the catalogue order in both directions (stable sort, comparator negated for descending). Sortable: Commodity, Unit, Price, Stock, Hold; Legal is not (Oolite has no legality sorter). The sort is session state, not saved (no save-format change). No keyboard key sorts (owner: click instead of Oolite's `/`).
- Market load line uses Oolite's exact sentence in one paragraph; the separate cash and load paragraphs go.
- Status page 1 becomes two columns (fields left, an "Equipment" heading and list right), so a long equipment list still fits; the heading drops Oolite's colon, as the market headings do. The status-page load line goes; page 2 carries Oolite's cargo line instead.
- Marker size is Oolite's blob in chart units: diameter in chart-x units = max(0.5 x zoom, 1 + 0.0017 x radiusKm) x 64 / 480 with zoom = spanX / 64, times the projection scale. With the projection scale 480 / (64 x zoom) it equals Oolite's blob_size exactly (unit-tested identity). The floor never binds in Wegolite's span range but is implemented. At the galaxy preset dots are about 1.5 to 3.3 px across; that is the faithful size on Wegolite's smaller galaxy view.
- State stays readable with sun-coloured fills: current, target and selection get rings in the existing CHART_CURRENT_COLOR, CHART_TARGET_COLOR and CHART_SELECTED_COLOR (radius max(marker radius + 2.5, 4.5) px); unreachable markers keep their sun colour at reduced alpha (the existing Wegolite cue); found matches get a green square outline. The 7 ly graph and the label colours are unchanged (owner).
- Label layout: forced labels (current, target, selection) are placed first, then search matches, then the existing candidates (the 12 nearest the centre at galaxy zoom); every box includes the descender and a 2 px margin, and a non-forced label whose box intersects any placed box is skipped. The returned list stays in system-index order.
- Find planet: a text box in the chart header labelled "Find planet:", focused by a new rebindable action chartFind on `/` (letters cannot start a search because P pauses and others may be rebound into the chart context); the query is trimmed and capped at 16 characters; a no-match keeps the typed text and shows "No match" (Oolite clears the string, which surprises in a text box); a readout shows "n of m"; each chart open starts with an empty search.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md
@.planning/todos/pending/2026-11-17-ui-chart-differences-from-oolite.md
@.planning/quick/261117-nfn-compare-wegolite-ui-screens-with-real-oo/261117-nfn-SUMMARY.md

Reviewer and subagent brief (AGENTS.md, quoted; include it in any subagent prompt):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Working rules for this plan:
- Quick task 261118-cyn (flight HUD) executes before this one and may touch index.html, src/render/hud/**, FIDELITY.md, CHANGELOG.md, PROJECT.md, README.md and src/input/actions.ts. HEAD will have moved: re-read every file before editing it, take the next free FIDELITY id from the file, and keep cyn's rows and bindings intact.
- Use the codebase-memory MCP index (project `wegolite`) before grepping (`search_graph`, `trace_path`, `get_code_snippet`); fall back to `rg` (never `grep`) for literals and non-code files. Include both instructions in any subagent prompt.
- Read Oolite behaviour from `/home/opencode/git/oolite`; quote FIDELITY excerpts from the pin with `git -C /home/opencode/git/oolite show 7437f22:<path>`. Never fetch Oolite files over the network.
- Targeted Vitest, typecheck and lint run in local Docker. Every browser run, the visual check and verify-full run ONLY on the remote through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <docker compose args>`: it syncs the COMMITTED HEAD and wipes the remote tree on each run, so commit first and run wrapper calls one at a time, never concurrently. Long runs go in the background; wait for the exit line.
- Format edited Markdown, HTML and TypeScript with prettier inside the lint container (`docker compose run --rm lint npx prettier --write <files>`), never on the host.
- Known flakes (rerun once before treating as real): `tools/oolite-ingest/convert/textures.test.ts` (5000 ms), e2e `launch.spec.ts:129` and `save-load.spec.ts:634`.
- The NPC acceptance run is not due: nothing under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` changes. State this in the SUMMARY.
- Every moved pin (expected strings, row counts, hint lines) is re-pinned with its traced cause in the commit message and the SUMMARY.
- Commit each task separately (code, tests and that task's CHANGELOG lines together, per AGENTS.md). Messages in English, ending with the attribution lines from the system reminder.

Interfaces the executor extends (current signatures):
- `buildMarketModel(market, profile, commodities, selection, feedback)` in src/ui/station-model.ts:266 returns `MarketModel { columns, rows, selectedKey, cashText, loadText, confirmText, noticeText }`; `MARKET_COLUMNS` at :172.
- `buildStatusModel(profile, system, labels, equipmentCatalogue, commodities, page, targetSystemName?)` at :392 returns `StatusModel { page, pageText, fields, equipment, manifest, loadText }`.
- `buildSystemDataModel(info, current, labels)` at :550; the inhabitants field is at :587.
- `createStationController(ctx, deps)` returns `{ ..., selectableKeys, ensureSelection, moveSelection, setStationPage, renderStation, ... }` (src/app/session/station-controller.ts:136-172, 591-690, 811-827); setStationPage is the guard pattern to copy.
- `StationShell` in src/ui/station.ts:56-66 (`onRefuel?` is the optional-handler pattern); market rendering at :225-244.
- Wiring path for a controller click sink: station-controller return, then src/app/game-session.ts:300-315 and :525-545, then StartSession deps src/app/session/start-session.ts:140-160 and :220-240, then the wiring site (:622-629 for the station nav, :767-775 for `docked.onLaunch`, :572-603 for the chart).
- `buildChartView(systems, currentId, targetId, camera, fuel, viewport, selectedId)` in src/ui/chart-model.ts:402 (27 call sites; extend with an optional trailing parameter only); `selectLabels(view, measure)` at :696; `projectionScale` at :324.
- `ChartOverlay` in src/ui/chart.ts:62-83; `createChartController(ctx, deps)` in src/app/session/chart-controller.ts (applyChartAction at :181); chart session state in src/app/session/context.ts:216-224 with initial values near :400-410; station state at :198-213 with initial values near :388-400.
- Keyboard: src/input/keyboard.ts:439-452 ignores keydown on text targets (`isTextTarget`, :332-342), and every action whose id starts with "chart" is drained to handleChartActions (:212-215).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Market sort by column heading, end to end (click, session state, sorted model, keys)</name>
  <files>index.html, src/ui/station-model.ts, src/ui/station.ts, src/app/session/context.ts, src/app/session/station-controller.ts, src/app/game-session.ts, src/app/session/start-session.ts, tests/ui/station-market.test.ts, tests/app/session/station-controller.test.ts, tests/e2e/station.spec.ts, CHANGELOG.md</files>
  <read_first>src/ui/station-model.ts (lines 124-321), src/ui/station.ts (whole file), src/app/session/station-controller.ts (lines 117-172, 591-690, 811-827, 905-940), src/app/session/context.ts (lines 197-213, 385-400), src/app/game-session.ts (lines 295-320, 525-545), src/app/session/start-session.ts (lines 140-160, 220-240, 620-630, 765-780), index.html (lines 293-314 and the market panel near 1816-1833), src/content/generated/commodities.json (names, units, sortOrder), tests/ui/station-market.test.ts (lines 1-200), tests/app/session/station-controller.test.ts (lines 1-140), tests/e2e/station.spec.ts (lines 1-180), and at the pin PlayerEntity.m 9612-9628 and 11868-11911</read_first>
  <behavior>
    - nextMarketSort(null, "price") is price ascending; price ascending then "price" is price descending; price descending then "price" is null; price ascending then "name" is name ascending.
    - sortMarketGoods with name ascending orders the 17 goods by a code-unit compare of their display names (Alien Items, Alloys, Computers, ... Textiles); unit ascending is t, then kg, then g, catalogue order within each; price, stock and hold ascending compare the price, the market stock and the profile cargo (0 when absent).
    - Descending negates the comparator but ties stay in catalogue order; null returns the catalogue order unchanged.
    - buildMarketModel with a sort returns rows in that order, Legal not sortable, and the active column's direction; without a sort argument every existing expectation still holds.
    - sortMarket ignores an unknown column, a non-market screen, pause, a lost context, an open chart or Save/Load screen; otherwise it cycles ctx.station.marketSort and re-renders, keeping the selected key and any pending confirmation (still naming the same commodity).
    - After sorting, selectableKeys, moveSelection and ensureSelection walk the sorted order.
  </behavior>
  <action>
Tests first (red), then implement. Owner decision: sort by clicking a heading instead of Oolite's `/` sorter cycle; no filter.

Model (src/ui/station-model.ts). Add exported types MarketSortColumn ("name" | "unit" | "price" | "stock" | "held") and MarketSort (an object with column and direction "ascending" | "descending", or null), an allow-list MARKET_SORT_COLUMNS, a pure nextMarketSort(current, column) implementing the cycle above, and a pure sortMarketGoods(goods, sort, commodities, cargo) that returns a new array (stable; ties in catalogue order for both directions; name compare by code units, not localeCompare; unit order t, kg, g as Oolite's OOMassUnit). Extend MarketColumn with sortable and sort (the direction or null) and give buildMarketModel an optional trailing sort parameter (default null) that orders the rows with sortMarketGoods and marks the columns. Cite PlayerEntity.m:9612-9628 and 11868-11911 at the pin in the doc comments.

Shell (src/ui/station.ts, index.html). Give each market heading a data-column attribute; mark the five sortable ones (pointer cursor, a scoped CSS rule). On every market render write each heading's text from the model's column label plus " ▲" or " ▼" for the active one and set aria-sort (ascending, descending or none on sortable headings). Add an optional onMarketSort?(handler) to StationShell (the onRefuel? pattern) backed by one delegated click listener on the market thead, under the existing AbortController, that passes only a value from MARKET_SORT_COLUMNS.

Session. Add marketSort: MarketSort to SessionStationState (initial null; not saved, not on the probe). In station-controller add sortMarket(column): copy setStationPage's guards (disposed, paused, contextLost, not docked, stationScreen not market, chart or Save/Load open), reject a column outside MARKET_SORT_COLUMNS, set ctx.station.marketSort = nextMarketSort(...), renderStation(). Do not clear the selection or the pending plan: a plan names its commodity by key, so a reorder cannot retarget it. Make selectableKeys and ensureSelection iterate sortMarketGoods(currentMarket.goods, ctx.station.marketSort, catalogue, profile cargo) and pass the sort into buildMarketModel in renderStation. Return sortMarket; thread it through game-session.ts and the StartSession deps exactly as setStationPage is threaded, and wire docked.onMarketSort?.(...) next to docked.onLaunch.

E2E (tests/e2e/station.spec.ts). Add one test named "F8 column headings sort the market and the keys follow the sorted order" (the remote run filters on "sort", so no other test name in the file may contain it; check with rg first) on a new game: open F8; click the Price heading; the data-key order of the market rows equals the probe market sorted by price ascending (ties in catalogue order) and the heading reads "Price ▲" with aria-sort ascending; click again for descending ("Price ▼"); click a third time and the order is the catalogue order again; with Price ascending active, ArrowDown moves window.__wegolite.station.selectedKey to the next selectable key in the sorted order.

CHANGELOG [Unreleased] Added: clicking a market column heading sorts the goods by name, unit, price, stock or the amount in the hold; a second click reverses the order and a third restores the usual order; the arrow keys and buying and selling follow the sorted list.

Commit (tests, code, CHANGELOG), then run the remote e2e for the new test only, after the local checks pass.
  </action>
  <verify>
    <automated>cd /home/opencode/git/wegolite && docker compose run --rm test npx vitest run tests/ui/station-market.test.ts tests/app/session/station-controller.test.ts && docker compose run --rm typecheck && docker compose run --rm lint && test "$(rg -c 'marketSort' src/app/session/context.ts || echo 0)" -ge 1 && test "$(rg -c 'onMarketSort' src/app/session/start-session.ts || echo 0)" -ge 1  # gates: session sort state [HEAD=0 EXPECT>=1]; click sink wired [HEAD=0 EXPECT>=1]. After committing: /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test --project=chromium tests/e2e/station.spec.ts -g sort" exits 0 (quote its exit line in the SUMMARY).</automated>
  </verify>
  <done>Clicking a market heading sorts, reverses and restores the rows in the browser, the active heading shows its direction, the arrow keys and trades follow the sorted order, and the remote targeted e2e run passes on the committed HEAD.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Station screens and hover card as Oolite: grouped credits, market line and fit, manifest, equipment on page 1, inhabitants, chart title; station docs</name>
  <files>src/sim/player/profile.ts, src/ui/station-model.ts, src/ui/station.ts, src/ui/chart.ts, src/ui/chart-model.ts, src/app/session/chart-controller.ts, index.html, tests/ui/station-status.test.ts, tests/ui/station-market.test.ts, tests/ui/station-system-data.test.ts, tests/ui/chart-model.test.ts, tests/app/session/chart-controller.test.ts, tests/e2e/station.spec.ts, tests/e2e/chart-gestures.spec.ts, tests/contract/fidelity.test.ts, CHANGELOG.md, FIDELITY.md, .planning/PROJECT.md, .planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md</files>
  <read_first>src/sim/player/profile.ts (lines 93-113), src/ui/station-model.ts (lines 76-83, 258-472, 540-600), src/ui/station.ts, index.html (lines 216-376 station CSS, 995-1035 tooltip CSS, 1816-1894 markup), src/ui/chart.ts (lines 62-83, 118-150, 508-530), src/app/session/chart-controller.ts (lines 99-138), src/sim/economy/cargo.ts (podsFor, holdPodsUsed, capacityPodsFor), tests/ui/station-status.test.ts (lines 251-345), tests/ui/station-market.test.ts (lines 172-200), tests/ui/station-system-data.test.ts (lines 55-95), tests/e2e/station.spec.ts (lines 95-180 and 503-600), tests/e2e/chart-gestures.spec.ts (lines 1-151), tests/contract/fidelity.test.ts (lines 38-60), FIDELITY.md (the Mechanics header, the E-98 row and excerpt, the Constants ledger header and the 261117-nfn Open items bullet), .planning/PROJECT.md (the Key Decisions table tail), and at the pin: oolite-locale-functions.js 43-92, descriptions.plist 80-83, 1587, 1601, 1635, 1692-1693, 1916-1919, PlayerEntity.m 7390-7425 and 9979-9986, PlayerEntityContracts.m 1055-1085, GuiDisplayGen.m 1541</read_first>
  <behavior>
    - formatDecicredits: 0 is "0.0 ₢", 99999 is "9999.9 ₢", 100000 is "10 000.0 ₢" with U+00A0, 123456789 is "12 345 678.9 ₢", Number.MAX_SAFE_INTEGER is "900 719 925 474 099.1 ₢", -100000 is "-10 000.0 ₢"; formatCredits and formatWholeCredits group the same way.
    - buildMarketModel's cashLoadText is exactly "Cash: 100.0 ₢. Load 0 of 20 t." for a new commander and "Cash: 92.4 ₢. Load 2 of 20 t." after buying 2 t.
    - buildStatusModel page 2: cargoText "Cargo 0 t (20 t)", cabinsText "Passenger Cabins 0 / 0", no manifest rows and emptyText "No cargo carried." for a new commander; with 3 t Food and 8 kg Gold the rows are "3 t × Food" then "8 kg × Gold" (market order), emptyText is empty and cargoText counts pods as the hold does; with two berths cabinsText is "Passenger Cabins 0 / 2" and the capacity shrinks by 10 t.
    - buildSystemDataModel: the field after the population has an empty label and the value "(Human Colonials)" for Lave; no field carries an Inhabitants label.
    - chartTitle(0) is "Galactic Chart 1" and chartTitle(7) is "Galactic Chart 8".
  </behavior>
  <action>
Tests first (red), then implement.

Credits (owner: group as Oolite, U+00A0). In src/sim/player/profile.ts add one private grouping helper over the integer digit string (groups of 3 from the right when it has 5 or more digits, joined with the escape  ), used by formatDecicredits; formatCredits keeps delegating. Use the helper in station-model's formatWholeCredits too (Oolite's formatCredits groups whole credits the same way). Never use toLocaleString. Cite oolite-locale-functions.js:60-92 and descriptions.plist:80-83 at the pin. Update the pinned strings in tests/ui/station-status.test.ts (123_456_789 and the two MAX_SAFE_INTEGER cases) with the traced cause; run the full local unit suite (docker compose run --rm test npm run test:fast) and re-pin anything else that moves.

Market line and fit. Replace MarketModel's cashText and loadText with cashLoadText, Oolite's market-cash-and-load sentence (the load uses holdPodsUsed and capacityPodsFor as now). In index.html replace the two market paragraphs with one paragraph data-field="market-cash-load" under the table and render it in station.ts. Tighten the market only (scoped to the market panel: row padding, line height, the heading margin) until all 17 rows and the cash-load line fit inside #station-screen at 1280x720 with no scroll; do not change the outfitting or home layouts.

Manifest (owner: Oolite's lines). In buildStatusModel replace the 16-row manifest and loadText with cargoText ("Cargo N t (C t)", N = holdPodsUsed, C = capacityPodsFor), cabinsText ("Passenger Cabins 0 / B", B = passengerBerths; Wegolite carries no passengers), manifest rows for held tradeable goods only, in sortOrder, each with key and text "<quantity> <unit> × <name>" (Oolite's manifest-cargo-quantity without its leading space), and emptyText "No cargo carried." when none is held. In index.html replace the page-2 table with a line holding the cargo and cabins texts (data-field manifest-cargo and manifest-cabins), a list data-manifest-rows of li items carrying data-key, and a paragraph data-field="manifest-empty"; remove the status-load paragraph and render the new fields in station.ts.

Status page 1 (owner: equipment visible). Lay page 1 out as two columns, the field list on the left and an "Equipment" heading (Oolite's status-equipment without the colon, hidden when the list is empty) over the equipment list on the right, with tighter field rows, so the list is inside #station-screen at 1280x720 without scrolling.

Hover card (owner). In buildSystemDataModel give the inhabitants field an empty label (value unchanged), so the card prints "(Human Colonials)" under the population value as Oolite's sysdata-line-8 does; the tooltip already renders an empty dt.

Chart title (owner). Add a pure chartTitle(galaxyIndex) in src/ui/chart-model.ts ("Galactic Chart " plus index + 1, GuiDisplayGen.m:1541); give the chart header span data-field="chart-title" in index.html, add setTitle(text) to ChartOverlay, and call it from openChart with ctx.core.system.galaxy; add setTitle to the chart-controller test double.

E2E re-pins, each with its traced cause. tests/e2e/station.spec.ts: the market-load assertion becomes the cash-load line "Cash: … ₢. Load 1 of 20 t."; the F5 page-2 assertions become the cargo line "Cargo 0 t (20 t)", the cabins line "Passenger Cabins 0 / 0", "No cargo carried." and zero manifest li items (drop the per-unit and Alien Items row checks, or move them to a manifest after a Food purchase); add a layout test: on a new game at the default 1280x720 viewport, F8's last market row and the cash-load line lie inside #station-screen's bounding box and its scrollHeight is not above clientHeight; F5 page 1's last equipment item likewise. tests/e2e/chart-gestures.spec.ts: the hover-card test also expects "(Human Colonials)" and no "Inhabitants" text; add the chart header expectation "Galactic Chart 1".

Docs in this commit. CHANGELOG [Unreleased] Changed: credits of 10 000 ₢ and more are grouped in threes as in Oolite; the market shows all 17 goods and Oolite's cash and load line at 1280x720; the manifest shows the cargo and cabin lines and only the goods carried; the status page shows the equipment list without scrolling; the chart title names the galaxy; the system card prints the inhabitants under the population without a label. FIDELITY.md: check tests/contract/fidelity.test.ts ROW_HEADING and EXCERPT_CELL first; if the next free id after the current last one would be E-100 or more and both patterns still take two digits, widen both to two or three digits in the same commit (traced cause: the id space ran out; existing ids unchanged). Add Mechanics rows with pin excerpts (each at most 20 lines, quoted verbatim from git show 7437f22): the market cash-and-load line (PlayerEntity.m:9979-9986, faithful); the F8 sort (PlayerEntity.m:9612-9628, divergence quoting the PROJECT.md row "Sort the F8 market by clicking a column header"); the manifest header and empty line (PlayerEntityContracts.m, a range of at most 20 lines covering the header and manifest-none, faithful); the chart title (GuiDisplayGen.m:1541-1541, faithful). Add a Constants ledger row for the credit grouping (size 3, threshold 5 integer digits, separator U+00A0; Resources/Config/descriptions.plist:80-83 and Resources/Scripts/oolite-locale-functions.js:60-92; pinned by tests/ui/station-status.test.ts). Resources-only facts (the hover-card line) get no Mechanics row (the Oolite cell must be src/Core). PROJECT.md Key Decisions: add "Sort the F8 market by clicking a column header" (rationale: a mouse-first station UI; first click ascending as Oolite's comparators, then descending, then default; no filter; owner 2026-11-18) and "Show no dashboard under the docked screens" (owner 2026-11-18: low play value). The station todo: prefix each fixed item and its Solution bullet with "Done in quick task 261118-cyo:", the filter, the dashboard and the palette with "Decided 2026-11-18, not to fix:" (palette: stays as it is for now, see the palette todo); when every item is done or decided, git mv it to .planning/todos/completed/ (the repo convention, e.g. commit e51ce72).

Commit, then run the remote e2e for the two edited specs.
  </action>
  <verify>
    <automated>cd /home/opencode/git/wegolite && docker compose run --rm test npx vitest run tests/ui/station-status.test.ts tests/ui/station-market.test.ts tests/ui/station-system-data.test.ts tests/ui/station-outfitting.test.ts tests/ui/chart-model.test.ts tests/app/session/station-controller.test.ts tests/app/session/chart-controller.test.ts tests/contract/fidelity.test.ts && docker compose run --rm typecheck && docker compose run --rm lint && test "$(rg -c 'market-cash-load' index.html || echo 0)" -ge 1 && test "$(rg -c 'label: "Inhabitants"' src/ui/station-model.ts || echo 0)" -eq 0 && test "$(rg -c 'data-manifest-rows\] tr' tests/e2e/station.spec.ts || echo 0)" -eq 0 && test "$(rg -c 'data-field="chart-title"' index.html || echo 0)" -eq 1 && test -f .planning/todos/completed/2026-11-17-ui-station-screen-differences-from-oolite.md  # gates: cash-load paragraph [HEAD=0 EXPECT>=1]; labelled inhabitants field [HEAD=1 EXPECT==0]; table-row manifest count in e2e [HEAD=1 EXPECT==0]; chart title field [HEAD=0 EXPECT==1]; station todo files in completed/ [HEAD=0 EXPECT==1]. After committing: /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test --project=chromium tests/e2e/station.spec.ts tests/e2e/chart-gestures.spec.ts" exits 0.</automated>
  </verify>
  <done>Credits are grouped as Oolite, the market shows 17 rows and Oolite's cash-and-load line at 1280x720, the manifest and status page match Oolite's content, the hover card and chart title match Oolite, the station docs are updated and the todo closed, and the two edited specs pass on the remote.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Chart markers, collision-free labels and Find planet; chart docs; visual check; final gates</name>
  <files>src/ui/chart-model.ts, src/ui/chart-draw.ts, src/ui/chart.ts, src/ui/station-hints.ts, src/input/actions.ts, src/input/bindings.ts, src/app/session/context.ts, src/app/session/chart-controller.ts, src/app/session/start-session.ts, src/app/game-session.ts, index.html, README.md, tests/ui/chart-model.test.ts, tests/ui/chart-draw.test.ts, tests/ui/station-hints.test.ts, tests/app/session/chart-controller.test.ts, tests/e2e/chart-gestures.spec.ts, tests/contract/fidelity.test.ts, CHANGELOG.md, FIDELITY.md, .planning/PROJECT.md, .planning/todos/pending/2026-11-17-ui-chart-differences-from-oolite.md</files>
  <read_first>src/ui/chart-model.ts (lines 36-180, 300-540, 640-757), src/ui/chart-draw.ts, src/ui/chart.ts, src/app/session/chart-controller.ts, src/app/session/context.ts (lines 214-224, 400-410), src/app/session/start-session.ts (lines 150-160, 230-240, 572-603), src/app/game-session.ts (lines 405-420, 525-545), src/input/actions.ts (lines 1-150, 165-230, 340-410), src/input/bindings.ts (lines 176-210), src/ui/station-hints.ts (lines 95-110), README.md (the Controls section), index.html (lines 960-1036 and the #chart markup), tests/ui/chart-model.test.ts (lines 1-60, 554-620, 864-915), tests/ui/chart-draw.test.ts (lines 1-120, 218-end), tests/app/session/chart-controller.test.ts (lines 1-70, 175-end), tests/ui/station-hints.test.ts (lines 50-60), tests/e2e/chart-gestures.spec.ts, tests/e2e/helpers/chart.ts, /tmp/ooref-ui/wego-src/ui-capture.spec.ts (the 261117-nfn scratch capture, a template), and at the pin GuiDisplayGen.m 1574-1576, 1785-1795, 1844-1862, 1874-1925, 2119-2160; Universe.m 7745-7771; PlayerEntityControls.m 1830-1860 and 2008-2030; OOColor.m 213-231</read_first>
  <behavior>
    - chartMarkerRadius(4116, 64 x 4, 480 / 256) equals Oolite's blob_size / 2 for Lave at zoom 4 (7.9972 / 4 / 2 in GUI units), and at zoom 1 with scale 7.5 it is 3.9986; a radius small enough with a large enough zoom hits the 0.5 floor; every buildChartView marker carries radius (px) and color (an rgb() string from sun_color; Diso is rgb(208, 132, 118)).
    - findSystemsByPrefix(galaxy, " DIS ") returns the ids of every system whose lower-cased name starts with "dis", in system-index order; an empty or whitespace query returns none; the query is capped at 16 characters.
    - selectLabels on the real galaxy 1 at the galaxy preset (viewport 1280x503, measure 7.25 px per character), with Lave current and a target and selection near the centre, returns labels whose boxes (including a 3 px descender) do not intersect; forced labels always appear and win over candidates; matches are labelled before candidates; output stays in system-index order.
    - needsChartRepaint is true when only the found set changes.
    - drawChart fills each painted marker with its color at its radius, strokes rings for current, target and selection, and outlines found matches.
    - handleFind query selects the first match and centres an off-view match (span unchanged); step +1/-1 wraps through the matches; commit sets the hyperspace target to the selection; clear empties the matches; every kind is ignored while the chart is closed, paused, disposed or the context is lost; openChart resets the search; the chartFind action calls focusFind on an open chart.
  </behavior>
  <action>
Tests first (red), then implement.

Markers (owner: sun colour, Oolite's size formula). In src/ui/chart-model.ts add named constants for Oolite's blob factor 0.0017, blob floor 0.5, GUI width 480 and chart width at max zoom 64, and a pure chartMarkerRadius(radiusKm, spanX, scale) implementing the mapping in the objective's discretion list. Add radius and color to ChartMarker in buildChartView (color from sun_color with Oolite's rule: components are 0..1 unless one exceeds 1, then all divide by 255; rounded and clamped to 0..255). Cite GuiDisplayGen.m:1788-1791 and 1846-1860 at the pin. In src/ui/chart-draw.ts fill each painted marker with marker.color at marker.radius (unreachable at reduced alpha), stroke the state rings in the existing colour constants (current, target, selection) at max(radius + 2.5, 4.5) px, and outline found matches with a green square; keep the paint order (edges, circle, target line, markers, rings and boxes, labels) and the 7 ly graph unchanged. Offset each label by at least the marker radius plus 2 px.

Labels (owner: no overlaps; skip a label that collides with one already placed). First write the failing selectLabels test above against the real galaxy and confirm it fails at HEAD; if it does not, trace the overlap with the real canvas measure in the visual-check capture before changing code, and record the traced cause in the SUMMARY. Then place labels in priority order (forced, then found matches, then the existing candidates with the galaxy-zoom limit of 12), test each non-forced box (descender and 2 px margin included) against every placed box, and return the list in system-index order.

Find planet (owner: like Oolite's "Find planet:", keyboard-friendly). Add a pure findSystemsByPrefix(systems, query) (trim, cap 16, lower-case both sides, prefix match, system-index order, Universe.m:7745-7771) and an optional trailing foundIds parameter to buildChartView that sets isFound on markers and exposes foundIds on the view; extend needsChartRepaint to compare foundIds. Add chartFindQuery, chartFindMatches and chartFindIndex to SessionChartState (initial empty). In index.html put a labelled text input "Find planet:" (maxlength 16, autocomplete off, spellcheck false) and a result span in the chart header beside the title. In src/ui/chart.ts add focusFind(), resetFind(), setFindResult(text) and onFind(handler) taking a discriminated event (query with text, step with +1 or -1, commit, clear); the input's input event sends query; its keydown sends step on ArrowDown/ArrowUp, commit then blur on Enter, clear then blur on Escape (each with preventDefault); hide() blurs the input when it has focus, so the game keys work after the chart closes. In chart-controller add handleFind(event) with the guards of setChartCamera: query sets the matches, index 0, selects the first match (Oolite targets the first found), centres the camera on it when its marker is off the viewport (clampChartCamera, span unchanged) and sets the readout ("No match", or "n of m"; a no-match keeps the selection and the typed text); step wraps as targetNextFoundSystem; commit sets ctx.core.hyperspaceTargetId to the selection as chartConfirm does; clear empties the search. Each change refreshes the chart and calls updateProbe. openChart resets the search and calls overlay.resetFind(). Pass foundIds from both buildChartView call sites (chart-controller and the start-session view builder). Wire overlay.onFind to handleFind in start-session through game-session (the selectChartSystem path).

Key. Add the action chartFind to src/input/actions.ts (the ActionId union, ACTION_IDS after chartBack, DEFAULT_BINDINGS Slash, ACTION_LABELS "Find planet", ACTION_CONTEXTS chart only; ids starting with "chart" are already drained to handleChartActions); applyChartAction case chartFind calls overlay.focusFind() when the chart is open. The keydown that fires it is consumed (bound), so no "/" reaches the box. Add Slash: "/" to CODE_LABELS in src/input/bindings.ts. Add "/: find" to chartHints before the commit hint and re-pin tests/ui/station-hints.test.ts. Add the README Controls row "Find planet | `/`" under Galactic chart and one sentence on the search under that table (the README contract test derives the rows from the bindings).

E2E (tests/e2e/chart-gestures.spec.ts). Add a Find planet test: open the chart; press "/" and the box has focus; type "dis" and window.__wegolite.chart.selectedId is the first prefix match in system-index order computed from the galaxy data the helpers read; press ArrowDown and the selection is the second match (or wraps); press Enter and chart.targetId equals the selection and the box no longer has focus; focus the box again, type "p" and the game is not paused, press Escape and the chart is still open with an empty box; type a prefix with no match and the readout says "No match" while the selection is unchanged.

Visual check (owner). Write a scratch Playwright spec under /tmp/cyo-visual (never in the repository), modelled on /tmp/ooref-ui/wego-src/ui-capture.spec.ts, that saves 1280x720 screenshots and a JSON of bounding boxes to /scratch/out: the market (default and sorted by Price), status page 1, the manifest empty and after buying 2 t Food, the chart at the local preset, at the galaxy preset, with the Lave hover card, and with "dis" typed in Find planet. Copy /tmp/cyo-visual to the remote with scp to opencode@192.168.178.51:/tmp/cyo-visual, run /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm -v /tmp/cyo-visual:/scratch e2e sh -lc "cp /scratch/zz-cyo-visual.spec.ts tests/e2e/ && npm run build:e2e && npx playwright test --project=chromium --workers=1 tests/e2e/zz-cyo-visual.spec.ts", copy /tmp/cyo-visual/out back with scp, then remove the remote scratch directory through a throwaway busybox container, as 261117-nfn did. Compare each shot with /tmp/ooref-ui/oolite/screenshots/02-market.png, 01-status.png, 03-sysdata.png, 04-chart-short.png, 05-chart-galactic.png and /tmp/ooref-ui/oolite-tracer/screenshots/01-status.png (Oolite's manifest), and record per pair what now matches and what still differs in the SUMMARY. Nothing from /tmp is committed.

Docs in this commit. CHANGELOG [Unreleased] Added: Find planet on the galactic chart (press /, type the start of a name, Down/Up for the next match, Enter to set it as the destination, Esc to clear). Changed: chart systems are drawn in their star's colour and sized by their planet's radius as in Oolite; chart labels no longer overlap. FIDELITY.md (after re-checking the id patterns as in Task 2): Mechanics rows with pin excerpts for the marker size (GuiDisplayGen.m:1788-1791, faithful, the mechanic text states the chart-unit mapping), the marker colour (GuiDisplayGen.m:1846-1860, faithful), the prefix search (Universe.m, at most 20 lines from 7745, faithful) and the Find planet box (PlayerEntityControls.m, at most 20 lines from 1836, divergence quoting the PROJECT.md row "Find planet on the galactic chart through a text box"); a Constants ledger row for the blob factor 0.0017, the 0.5 floor, the 480-unit GUI and the 64-unit chart width, pinned by tests/ui/chart-model.test.ts; in the 261117-nfn Open items bullet mark each item fixed by this plan "(fixed in quick task 261118-cyo)" and the dashboard, the palette and colours, and the 7 ly graph "(decided in quick task 261118-cyo: not to fix)". PROJECT.md Key Decisions: "Find planet on the galactic chart through a text box" (rationale: letters double as game keys, P pauses; / focuses; prefix match, wrap cycling and first-match selection as Oolite; Enter commits; a no-match keeps the text) and "Keep the 7 ly jump graph on both chart presets" (owner 2026-11-18). The chart todo: prefix each fixed item and its Solution bullet "Done in quick task 261118-cyo:", the 7 ly graph and the colours "Decided 2026-11-18, not to fix:" (colours stay for now); git mv it to .planning/todos/completed/.

Final gates, after committing, quoting every exit line in the SUMMARY: local docker compose run --rm test, docker compose run --rm lint, docker compose run --rm typecheck; then remote /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test --project=chromium tests/e2e/chart-gestures.spec.ts tests/e2e/station.spec.ts tests/e2e/station-tabs.spec.ts"; then remote run --rm verify-full (input bindings changed), in the background, waiting for its exit line. A failure is fixed in a new commit and its gate rerun; a known flake is rerun once.
  </action>
  <verify>
    <automated>cd /home/opencode/git/wegolite && docker compose run --rm test npx vitest run tests/ui/chart-model.test.ts tests/ui/chart-draw.test.ts tests/ui/station-hints.test.ts tests/app/session/chart-controller.test.ts tests/input/bindings.test.ts tests/contract/readme.test.ts tests/contract/fidelity.test.ts && docker compose run --rm typecheck && docker compose run --rm lint && test "$(rg -c 'chartFind' src/input/actions.ts || echo 0)" -ge 5 && test "$(rg -c '0\.0017' src/ui/chart-model.ts || echo 0)" -ge 1 && test "$(rg -c 'Find planet' README.md || echo 0)" -ge 1 && test "$(rg -c 'Slash: "/"' src/input/bindings.ts || echo 0)" -eq 1 && test -f .planning/todos/completed/2026-11-17-ui-chart-differences-from-oolite.md && test "$(rg -c '261118-cyo' FIDELITY.md || echo 0)" -ge 1  # gates: chartFind in actions [HEAD=0 EXPECT>=5]; blob factor [HEAD=0 EXPECT>=1]; README row [HEAD=0 EXPECT>=1]; Slash label [HEAD=0 EXPECT==1]; chart todo files in completed/ [HEAD=0 EXPECT==1]; FIDELITY mentions this task [HEAD=0 EXPECT>=1]. Then the final chain in the action: local test, lint, typecheck; remote targeted e2e; remote verify-full; each exit=0.</automated>
  </verify>
  <done>Chart markers carry Oolite's sun colour and size, labels never overlap, Find planet works from the keyboard and the mouse, the visual comparison is recorded, both todos are closed, the docs are updated, and local test, lint, typecheck plus remote targeted e2e and verify-full pass on the committed HEAD.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| DOM click → station controller | a heading click carries a data-column string; page script can forge or re-enable it |
| text input → chart controller | the Find planet text is free user input reaching the matcher and the readout |
| focused text box → game keyboard | while the box has focus the game ignores keys; a stuck focus would disable pause and close |
| local host → remote test machine (ssh) | the wrapper syncs only the committed HEAD; the scratch spec is copied over scp and removed after |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-cyo-01 | Tampering | `sortMarket` in station-controller, the thead click sink in station.ts | low | mitigate | both the shell and the controller accept only MARKET_SORT_COLUMNS; the controller repeats setStationPage's guards (paused, overlay, wrong screen, lost context); unit tests pin an unknown column and each guard |
| T-cyo-02 | Elevation of privilege | trade confirmation under a re-sort | medium | mitigate | a pending plan is keyed by commodity, never by row index; sorting keeps the plan and the selection key; a controller test sorts with a pending plan and confirms it trades the same commodity |
| T-cyo-03 | Denial of service | `findSystemsByPrefix`, `handleFind` | low | mitigate | maxlength 16 on the input and a 16-character cap in the model; one pass over 256 names per keystroke; repaint is coalesced by needsChartRepaint |
| T-cyo-04 | Tampering | chart readout, labels, manifest rows | low | mitigate | every dynamic string goes through textContent or the input's own value; no innerHTML is added; the query is only compared, never rendered as markup |
| T-cyo-05 | Denial of service | Find planet focus | medium | mitigate | Enter and Escape blur the box, hide() blurs it when focused, openChart resets it; the e2e test checks P does not pause inside the box and Esc clears without closing the chart |
| T-cyo-06 | Tampering | repository contents | low | mitigate | the scratch spec, screenshots and Oolite output stay under /tmp; the remote scratch is removed through a busybox container; the SUMMARY's self-check confirms no /tmp artefact is tracked |
| T-cyo-07 | Repudiation | gate evidence | low | mitigate | the SUMMARY quotes every local and remote exit line with its snapshot SHA and the traced cause of every re-pinned value |
| T-cyo-SC | Tampering | npm/pip/cargo installs | low | accept | this plan installs no packages; the existing images are used as they are |
</threat_model>

<verification>
- Each task's local verify passes (targeted Vitest, typecheck, lint, the FIDELITY and README contracts) and its remote targeted e2e run exits 0 on the committed HEAD.
- Final: local `test`, `lint`, `typecheck` and remote `verify-full` exit 0 on the last commit.
- The visual check covers market, sorted market, status, both manifests, both chart presets, the hover card and Find planet, each compared with its Oolite screenshot in the SUMMARY.
- `git diff --stat <plan-start>..HEAD -- src/sim/npc src/sim/world src/content/generated` is empty, so neither the NPC acceptance run nor the content drift check is due.
</verification>

<success_criteria>
- F8: 17 rows and "Cash: 100.0 ₢. Load 0 of 20 t." visible at 1280x720; heading clicks sort, reverse and restore; keys and trades follow the sorted order.
- Credits of 5 or more integer digits print with U+00A0 groups of three everywhere.
- F5: Oolite's manifest lines and the equipment list on page 1 without scrolling.
- Chart: "Galactic Chart 1", sun-coloured markers sized by Oolite's formula, no overlapping labels, "(Human Colonials)" without a label, and a keyboard-friendly Find planet.
- Both todos closed, FIDELITY rows and ledger rows, four PROJECT.md decisions, CHANGELOG entries, the visual comparison, and green local and remote gates.
</success_criteria>

<output>
Create `.planning/quick/261118-cyo-bring-the-station-screens-and-chart-clos/261118-cyo-SUMMARY.md` when done
</output>
