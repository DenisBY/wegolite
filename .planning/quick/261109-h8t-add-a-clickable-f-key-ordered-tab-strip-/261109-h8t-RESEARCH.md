# Quick Task 261109-h8t: Clickable F-key tab strip - Research

**Researched:** 2026-11-09
**Domain:** Vanilla TS/DOM UI wiring inside an existing session (no new packages)
**Confidence:** HIGH for integration points (all files opened this session); MEDIUM for pixel budget (estimated, must be measured)

<user_constraints>
## User Constraints (from CONTEXT.md)

Locked decisions are in `261109-h8t-CONTEXT.md` and are not revisited here. Condensed verbatim from its `## Implementation Decisions`:

- Tab set: `Home | F1 Launch | F2 Save/Load | F3 Outfitting | F4 Interfaces | F5 Status | F6 Chart | F7 System data | F8 Market`. No merging. Sub-tabs only Status | Manifest (`stationPage` 1/2) and Short | Long (`chartRange`). Tab/PageUp/PageDown paging unchanged; arrow keys never switch tabs. Hidden registry slots for Shipyard and Market Info; no visible placeholder.
- F4 Interfaces is a live tab showing "No interfaces are installed on your ship or enabled at this station".
- `F1 Launch` enabled only on Home; a tab click must never launch from a section, the chart or the save screen.
- Registry in `src/ui/station-tabs.ts` (pure, no DOM, no Three.js), tab stores an `ActionId`, key label derived from bindings, availability from `ACTION_CONTEXTS` plus paused/launching guards. One `navigateStation()` in `game-session.ts` routes through `openStationScreen`, `backToHome`, `openChart`, F2 open, closing an open overlay first. Clicking the active tab is a no-op. The same `<nav aria-label="Station computer">` is rendered into `#docked`, `#chart` and the save-load screen; hidden on the chart when not docked. `aria-current="page"` on the active tab. Tab buttons `tabindex="-1"` + `mousedown` preventDefault; no `role="tablist"`. `keyHints()` generated from the registry.
- Style: ~15px font, one row at 1280x720, `flex-wrap` safety net only; selected vs focus-visible differ; new borders/dim colours reach 3:1.
- Tests: `tests/ui/station-tabs.test.ts` (drift, availability matrix, `activeTabId` precedence, `keyHints`); E2E for click each tab, overlay-to-overlay restore, F1 disabled off Home, no launch from a tab, focus not stolen, no wrap at 1280x720. Keep `data-field`, `#station-screen[data-screen]`, `tr[data-key]` hooks and the "Market (F8)" home strings.
- Claude's discretion: labels, registry shape, visual states, clickable Home tiles, behaviour with a pending Outfitting `[Y/N]` (reuse F-key path).

Out of scope: repeat-F-key cycling, ship-summary strip, Shipyard / Market Info content, missions content.
</user_constraints>

## Project Constraints (from AGENTS.md)

- Docker only for tests/builds; host results are not evidence. Scratch files live in `/tmp` and are mounted, never added to the repo.
- `src/sim/` stays DOM-free (this task should not touch it). Content is compiled from Oolite configs; do not hand-edit `src/content/generated/**`.
- Record the decision in `.planning/PROJECT.md` Key Decisions; docs/commits in English. Work goes through a GSD entry point (this is `/gsd-quick`).
- Prettier is part of `lint` (`npm run lint` = `eslint . && prettier --check .`): format `index.html` and `README.md` via `docker compose run --rm lint npx prettier --write <file>`.

## Summary

Every integration point exists and is simple, but four things in the code the reviews may not have caught shape the design. (1) Tab availability cannot be derived by evaluating `ACTION_CONTEXTS` against the live input context: while the chart or save screen is open the context is `chart`/`saveScreen`, which excludes every station action and (for `saveLoad`) excludes `chart`. Availability must be evaluated against a derived base context (`dockHome` if `stationScreen === "home"`, else `dockScreen`) plus an overlay flag. (2) `#docked button { ... }` (index.html:296-309) has higher specificity than any `.station-nav button` rule and inverts colours on hover/focus-visible, including disabled buttons. (3) `openStationScreen` and `backToHome` do not check `paused`, `chartOpen`, `saveScreenOpen` or the overwrite dialog; the keyboard layer did that implicitly through input context. `navigateStation` must add those guards itself. (4) Adding F4 requires touching five places in `actions.ts`, plus `README.md` (a contract test pins the Controls table to `ACTION_IDS`).

**Primary recommendation:** Build a pure `station-tabs.ts` registry + a small DOM `station-nav.ts` hydrator; one `navigateStation(tabId)` in the session with explicit guards; one idempotent `syncStationNav()` called from `renderStation`, open/close chart, open/close save screen and the Load install block. Add `stationInterfaces` (F4 / Digit4) as a full action. Use a literal, test-guarded string for the Interfaces empty state.

## Integration points (verified by reading the files this session)

### index.html
- `#docked` markup 668-753: `header.station-header` 669-672, `section#station-screen` 673-746 (panels `home`/`market`/`outfitting`/`status`/`systemData`, each `data-station-panel`), `div.station-footer` 747-752. Home tiles `div.station-entry` 684-687 hold `Market (F8)`, `Outfitting (F3)`, `Status (F5)`, `System data (F7)`; Launch is `<button type="button" data-action="launch">` at 689.
- `#chart` 754-766: header, `canvas#chart-canvas` (flex:1), `div.station-footer`. CSS 344-378, `z-index: 10`.
- `#save-load` 767-811: header, `section#save-load-screen` (`tabindex="-1"`), footer, and `#save-load-confirm` alertdialog (`position:absolute; inset:0; z-index:2`, CSS 452-461) that visually and physically covers anything else inside `#save-load`, including a nav. CSS 385-394 `z-index: 10`.
- `#pause` `z-index: 20` (CSS 509-514). Because nav lives inside the z-10 containers, it is always beneath pause; do not give the nav its own z-index.
- Section CSS 150-165: `padding: 1rem 2rem 14rem`; panels are shown by `#station-screen[data-screen="x"] [data-station-panel="x"] { display:block }` (157-165). The F4 panel needs a new rule in that list (the `[hidden]{display:none !important}` at 605 still governs).
- `#docked button` 296-309 (padding .6rem 1rem; `border:1px solid #33ff66`; hover/focus-visible invert to green fill). **Pitfall:** any new nav button inside `#docked` inherits this. Scope the nav rules as `#docked .station-nav button`, `#chart .station-nav button`, `#save-load .station-nav button`, and add `:disabled:hover` / `:disabled:focus-visible` resets.
- `.station-footer` is `position: fixed; bottom: 6rem` (314-324), `#chart`/`#save-load` override to `bottom: 2rem`. `body > footer` is the global disclaimer (612). The footer is a div; the nav must be a `<nav>` and must not be a `<footer>` (`tests/compliance.test.ts:199` counts `^ *<footer\b`).
- Existing colours that fail 3:1 on `#000` (computed with a 10-line WCAG script in /tmp this session): `#1a5a2c` = 2.54:1, `#2a5a35` = 2.61:1. `#2f8a47` = 4.85:1 on `#000` and 3.58:1 on the selected background `#0a2a12`; `#33ff66` = 15.64:1. Use `#2f8a47` (or brighter) for tab borders and disabled text. [VERIFIED: computed in this session]

### src/ui/station.ts
- `StationScreen = "home" | "market" | "outfitting" | "status" | "systemData"` (31-32). Add `"interfaces"`.
- `createStationShell` gathers every element with `requireElement` (99-233) and throws a named error if missing; add `interfacesPanel` the same way. `applyScreen` (309-320) toggles `hidden` per panel and focuses `#station-screen` on screen change; add the interfaces line. `render(view)` (341-363) writes the four independent footer fields. It owns a `controller = new AbortController()` (235) that is aborted in `dispose` (365) but currently has no listeners; the `docked` panel's Launch click uses `home.onLaunch` (docked.ts) with its own controller.
- The station shell is created once in `src/main.ts:138`; chart and save-load are created inside session `start()` (game-session.ts 2752, 2767). There is one session per page, so hydrate the three navs in `start()` with one `createStationNav(document.body)` call (same style as `createChart(document.body)`), attach one delegated `click` listener per `<nav>` with `{ signal: uiController.signal }` (342, aborted in `dispose` 2970).

### src/ui/chart.ts and src/ui/save-load.ts
- `createChart` requires `#chart`, `#chart-canvas` and four `[data-field]` elements (83-107). `canvas` is `flex:1`; a nav inserted between header and canvas shrinks it, and a `ResizeObserver` (200-210) repaints. `openChart` calls `overlay.show(view)` then `overlay.view(view)` (game-session 1630-1631): **toggle the nav's `hidden` before `overlay.show`** so the first paint measures the final canvas size. E2E helpers (`tests/e2e/hyperspace.spec.ts:94`, `core-loop.spec.ts:142`, `autosave.spec.ts:232`) compute marker pixels from `#chart-canvas.boundingBox()` live, so they stay correct whether the nav is shown or hidden, as long as the repaint finished (they already wait on `chart.open`; prefer also waiting on `data-paints` stabilising in the new spec).
- `createSaveLoadScreen` attaches a delegated `click` on `#save-load` (212-228) that ignores any target without `[data-save-action]` and returns early while `confirming`; nav buttons inside the overlay are therefore inert to it. `show()` focuses `#save-load-screen` (279); `closeConfirm` refocuses the section (257-260). The mousedown preventDefault keeps focus where it is.

### src/app/game-session.ts (line numbers verified)
- State: `stationScreen` 375, `stationPage` 381, `chartOpen` 387, `chartRange` 388, `contextBeforeChart` 391, `saveScreenOpen` 398, `contextBeforeSaveScreen` 399, `manualSavePending` 415, `loadingSave` 416, `paused` 442, `contextLost` 445, `uiController` 342.
- `keyHints(screen)` 801-815 (hard-coded strings; no test asserts them, verified by `rg` over `tests/`). `renderStation()` 817-895 returns early if `market`/`commodities` are undefined, so nav sync must not depend only on it. `syncEconomyProbe` 897-931 publishes `probe.station.screen`.
- `openStationScreen(action)` 1509-1545: requires `state.mode === "docked"`; resets `stationPending`, `stationNotice`, `stationPage = 1`, selection; sets context `dockScreen`; renders. It has a `switch` over the four screen actions (1515-1530): add `stationInterfaces -> "interfaces"`.
- `backToHome()` 1547-1555: early-returns if already `home`, sets `dockHome`.
- `openChart()` 1611-1633 guards `paused || chartOpen || mode === "launching"`; records `contextBeforeChart = currentInput.getContext()`. `closeChart()` 1635-1643 restores it and calls `loop.reset()`.
- `openSaveScreen()` 1656-1678 guards `paused || saveScreenOpen || chartOpen` and `mode !== "docked"`. `closeSaveScreen()` 1681-1691 calls `cancelOverwrite`, restores `contextBeforeSaveScreen` and refocuses `#station-screen`.
- `docked.onLaunch` handler 2901-2905: `if (state?.mode !== "docked" || stationScreen !== "home") return; pending.push({ kind: "launch" })`. The frame also filters `launch` commands unless `stationScreen === "home"` (2507-2511). Reuse the same push in `navigateStation("launch")` but also require `!paused && !chartOpen && !saveScreenOpen`.
- `frame()` 2441: chart edges are drained before the freeze branch (2469); while `chartOpen` or `saveScreenOpen` everything else is drained and discarded (2475-2493). `loadFromSave()` 1241-1370 guards `!saveScreenOpen` after the IndexedDB `await` (1259, the G-8 guard) and its install block sets `chartOpen = false`, `saveScreenOpen = false`, `stationScreen = "home"` and a new input context (1337-1355): add a nav sync there.
- `handleEvent` `launched` (2075-2089) hides `#docked`; `docked` (2099-2129) shows it and resets `stationScreen`. `handleHyperspaceJumped` (1920) resets `stationScreen = "home"`.

### src/input
- `actions.ts`: `ActionId` union 13-59; `ACTION_IDS` 84-134 (order matters: later entry loses a conflicting code); `DEFAULT_BINDINGS` 147-201 (`launch: ["Digit1","F1"]`, `stationMarket: ["F8","Digit8"]`, `stationOutfitting: ["F3","Digit3"]`, `stationStatus: ["F5","Digit5"]`, `stationSystemData: ["F7","Digit7"]`, `chart: ["F6"]`, `saveLoad: ["F2"]`); `ACTION_LABELS` 203-250; `RESERVED_F_KEYS` 279-286 = `F2, F3, F5, F6, F7, F8`; `ACTION_CONTEXTS` 300-350 (`launch: flight, dockHome`; `chart: flight, dockHome, dockScreen, chart`; `saveLoad: dockHome, dockScreen`; station screen actions `dockHome, dockScreen`); `STATION_SCREEN_ACTIONS` 353-358.
- `keyboard.ts`: `STATION_SCREEN_ACTIONS` actions call the synchronous `onStationScreen` handler (194-199). Without membership in that set, a new `station*` action would fall through to `action.startsWith("station")` and be queued as a drained station action (208-211) instead of opening a screen. Tab is bound in `dockScreen` (stationPageNext) and `chart` (chartRange), so the window listener `preventDefault`s it there; in `dockHome` and `saveScreen` Tab is native, which is why `tabindex="-1"` on nav buttons matters. A bound-but-not-contextual reserved key returns true (154); non-reserved returns false so the browser default runs.
- `bindings.ts`: `createBindingMap` fills a missing action from `DEFAULT_BINDINGS`; `settings/schema.ts:111` rejects unknown action keys in a persisted blob, so an old blob without `stationInterfaces` loads fine (no migration). `codeLabel` falls back to the raw code, so `F4` renders as `F4`.
- `src/ui/controls.ts:192` lists all `ACTION_IDS` automatically (new action appears in Controls with its label).

## F4 Interfaces: exact changes

1. `actions.ts`: add `"stationInterfaces"` to `ActionId`, `ACTION_IDS` (after `stationSystemData`), `DEFAULT_BINDINGS` (`["F4", "Digit4"]`; Digit4 is free and is Oolite's own alias, `n_key_gui_screen_interfaces` default `'4'`/`gvFunctionKey4`, PlayerEntityControls.m:376), `ACTION_LABELS` (`"Interfaces"`, must stay unique), `ACTION_CONTEXTS` (`contexts("dockHome", "dockScreen")`), `STATION_SCREEN_ACTIONS`. [VERIFIED: actions.ts read in full; Oolite PlayerEntityControls.m:376, 4019]
2. `station.ts`: `StationScreen` union, `interfacesPanel`, `applyScreen`. `index.html`: `<div data-station-panel="interfaces" hidden>` + the CSS display rule. `probe.ts:115` `screen` union is a hand-copied literal union: add `"interfaces"`. Optionally derive it from `StationScreen` to stop the drift.
3. `game-session.ts` `openStationScreen` switch; no selection/model needed for this screen; `renderStation` needs no new model (static text).
4. **No save-schema impact.** `stationScreen` is not persisted (`handleEvent` resets it to `home`; `snapshotForSave` inputs at 1059-1067 carry no screen). Settings: no schema change (see bindings above). [VERIFIED: game-session.ts 1046-1068, 2103]
5. `README.md` Controls table "Docked station" needs a row `| Interfaces | `F4 / 4` |`. `tests/contract/readme.test.ts` fails on a missing or stale row; run prettier on README afterwards (table realignment).
6. Browser reservation: `RESERVED_F_KEYS` omits F1 and F4. F1 is already bound to `launch` but only live in `flight`/`dockHome`; in `dockScreen`, `chart` and `saveScreen` it falls through to the browser, and Chrome/Firefox open their help page on F1 [ASSUMED: browser behaviour from training; not exercised in this session]. Now that the strip advertises "F1 Launch" (disabled off Home), recommend adding `F1` and `F4` to `RESERVED_F_KEYS` and extending the capture-guard e2e at `tests/e2e/station.spec.ts:273-364` (`codes` array at 307) plus the "six reserved" wording in `keyboard.ts` doc comments (20-21, 351, 417). The existing e2e dispatches synthetic events and asserts `defaultPrevented`, so the claim becomes testable. F4 plain has no known default in Chrome/Firefox [ASSUMED]; including it is harmless and keeps "every tab key is guarded" a single invariant.
7. **Empty-state text source.** `third_party/oolite/Config/descriptions.plist:1861` (vendored, pinned) reads `"interfaces-no-interfaces-available-for-use" = "No interfaces are installed on your ship or enabled at this station";` and `:1860` `"interfaces-title" = "Ship and System Interfaces";` (the checkout has them at 1906/1905; the vendored copy is the audited input). Oolite's screen is `PlayerEntity.m:8586` `setGuiToInterfacesScreen`, title via `DESC(@"interfaces-title")` (8604). [VERIFIED: read both files this session]. The content build does **not** compile these keys: `tools/oolite-ingest/convert/labels.ts` emits only six arrays plus `sysdata-*` string keys (`FORMAT_TEMPLATE_PREFIX = "sysdata-"`), and `LabelsSchema` is a `z.strictObject` (`src/content/schemas/labels.ts`). Extending the converter would change the schema, regenerate `labels.json` and re-pin `labels.test.ts` counts. Recommendation: a literal constant (for example `INTERFACES_TITLE` / `INTERFACES_EMPTY_TEXT` in `station-model.ts` or `station-tabs.ts`) with a source comment, plus a Vitest guard that `readFileSync("third_party/oolite/Config/descriptions.plist")` contains both exact strings (the repo's tests already read files this way, for example `tests/contract/readme.test.ts`). This does not violate "do not hand-edit generated data" (it is source, not `src/content/generated/**`). Record the text provenance in `ASSETS.md` only if the existing `descriptions.plist` row does not already cover derived UI strings.

## Architecture notes the planner needs

**Availability must use a base context, not the live input context.** Define in the registry a pure function of `{ mode: docked|other, paused, launching, overlay: none|chart|saveScreen, base: dockHome|dockScreen }` where `base` = `dockHome` iff `stationScreen === "home"`. Rules:
- Station-screen tabs and Home: enabled if docked and not paused and not confirming (derive from `ACTION_CONTEXTS[action].includes(base)`).
- `saveLoad`: enabled if docked (derive from `ACTION_CONTEXTS.saveLoad.includes(base)`). It is deliberately enabled on the chart because navigation closes the chart first; `ACTION_CONTEXTS.saveLoad` excludes `chart` (line 326 comment: never over the chart), so the registry must evaluate it against `base`, not the live context.
- `chart`: `ACTION_CONTEXTS.chart` includes all docked contexts and `flight`.
- `launch`: enabled iff docked, `overlay === none` and `base === dockHome` (ACTION_CONTEXTS alone would enable it on a chart opened from Home; CONTEXT forbids that).
- `activeTabId` precedence: `saveScreenOpen` then `chartOpen` then `stationScreen` (map `home -> "home"`). The two overlays are never open together (`openSaveScreen` refuses when `chartOpen`; `chart` is not live in `saveScreen`).

**`navigateStation(tabId)` sequence** (all guards first): ignore if `disposed`, `state?.mode !== "docked"`, `paused`, `contextLost`, `loadingSave` is fine (see pitfall 5), `saveLoad?.isConfirming()`, or the tab is already active / disabled. Then: if `chartOpen` call `closeChart()`; if `saveScreenOpen` call `closeSaveScreen()` (both restore the prior station context and must run before the target open, because `openChart`/`openSaveScreen` record `contextBefore*` from the live context and `openSaveScreen` refuses while `chartOpen`). Then dispatch: home -> `backToHome()`; screens -> `openStationScreen(actionId)`; chart -> `openChart()`; saveLoad -> `openSaveScreen()`; launch -> same `pending.push({ kind: "launch" })` as 2904. Finish with `syncStationNav()`. Overlay-to-overlay therefore returns to the station screen on Esc, never to the previous overlay.

**Nav DOM**: `<nav class="station-nav" aria-label="Station computer" data-station-nav></nav>` placeholder in each of the three containers, hydrated from the registry (labels `textContent`, `type="button"`, `tabindex="-1"`, `data-nav-tab="<id>"`). Do **not** reuse `data-action="launch"` for the Launch tab: `scene.spec.ts:131-133` asserts `button[data-action="launch"]` has `toHaveCount(1)` and eight other specs do `page.click('button[data-action="launch"]')` (the nav precedes the section in DOM order, so a duplicate attribute would hijack those clicks). Use native `disabled` for unavailable tabs (click events never fire, and Playwright `toBeDisabled` works). Key labels should come from the live `bindings` map via `labelFor`/`codeLabel` (first code) so a rebind in Controls updates the strip: call `syncStationNav()` from the Controls `onChange` and `onReset` callbacks (game-session 2831-2842, `resetAllSettings` 2020).

**Sub-tabs** need two new session setters: `setStationPage(1|2)` (status: set `stationPage` and `renderStation()`, mirrors 2003-2013) and `setChartRange("short"|"long")` (the current handler only toggles, 1794-1798). Render them as `aria-pressed` toggle buttons, not tabs. Place Status|Manifest inside the status panel and Short|Long in the chart header/footer; each adds roughly one row of height on that screen only.

**Footer hints**: generate the "other screens" portion from the registry (excluding the current screen) and keep the screen-specific prefix. Keep each hint under ~125 characters at 15px monospace (about 9 px per glyph, 1216 px usable [ASSUMED: glyph width]); a wrap grows the fixed footer upward over content. The market hint is already ~105 characters with no F-key list, so the market screen should not gain the F-key list (the strip now carries it).

## Pitfalls (specific to this code)

1. **Specificity of `#docked button`** (see index.html). Symptom: nav buttons render 18px with 0.6rem padding and wrap. Fix by scoping nav selectors with the container id.
2. **Tab key / focus.** `dockScreen` and `chart` already `preventDefault` Tab; `dockHome` and `saveScreen` do not, so nav buttons need `tabindex="-1"` or Tab walks through nine buttons and Enter then clicks one natively (Enter is not bound in `dockHome`). Add a mousedown `preventDefault` on the `<nav>` (delegated) so clicking never moves focus off `#station-screen`/`#save-load-screen`; `station.ts applyScreen` already refocuses the section on screen change. E2E: after a tab click, `document.activeElement` is unchanged and a following `Digit8` still works.
3. **Missing guards in the existing open paths.** `openStationScreen` and `backToHome` ignore `paused`, overlays and the overwrite dialog, because keys reach them only through context. The pause overlay already blocks pointer events physically (`z-index: 20`), but `navigateStation` must still check `paused` and `contextLost` (the QUAL-05 path pauses and sets `contextLost`), and `saveLoad.isConfirming()` (the dialog owns input; it also physically covers the nav).
4. **Launch click race.** `launch` is queued in `pending` and consumed in `frame()`; `#docked` is hidden only on the `launched` event. A second tab click in that window runs `openStationScreen` (mode is still `docked`), and the frame then drops the queued launch (2507-2511 filter on `stationScreen === "home"`). This is consistent and safe, but state it in a test comment; after `mode === "launching"` the strip is hidden and `openChart` refuses. Do not add a separate "launching" guard that diverges from this.
5. **Save in flight.** `writeManualSave` sets `manualSavePending`; `loadFromSave` sets `loadingSave` and awaits `store.read()`. Navigating away closes the screen (`saveScreenOpen = false`); the post-await guard at 1259 aborts the Load, and save completion only writes notices (`setSaveNotice`, `renderStation`, `setSlot` only `if (saveScreenOpen)`), so no extra guard is needed. It is the same behaviour Esc already has. Risk to cover in review: reopening F2 before the read resolves lets the old Load proceed (pre-existing, not introduced here).
6. **Double registration.** Hydration is a one-shot at `start()`; use `replaceChildren()` for idempotence and the shared `uiController.signal` for listeners. Do not put listeners on individual buttons that `syncStationNav` re-creates; mutate attributes in place and cache a state key to skip no-op writes.
7. **Chart in flight.** F6 opens the chart in flight (`ACTION_CONTEXTS.chart` includes `flight`); hide the chart nav when `state.mode !== "docked"`, before `overlay.show`. Because only `#chart` toggles it, no other overlay needs the rule.
8. **Home/overlay no-op subtlety.** With `stationScreen === "home"` and the chart open, the active tab is Chart; clicking Home must close the chart even though `backToHome()` early-returns. Sequence above handles it (close overlay, then `backToHome()`), but test it.
9. **Active-tab click is a no-op**, which differs from the keyboard: pressing F3 on Outfitting re-runs `openStationScreen` and resets selection/pending. This divergence is intended by CONTEXT; do not "fix" it by calling `openStationScreen` on a re-click.
10. **Vertical budget (estimate, measure).** Header about 56 px; fixed footer top about 522 px (96 px offset + about 102 px for four 1.5em lines) at 720 px height, so the visible section area is roughly 100 to 520 px with the strip (about 40 px) added, and `#station-screen` scrolls internally (`overflow-y:auto`, `14rem` bottom padding). The market table (17 rows) and outfitting list already exceed this; they scroll today. Keep the 14rem padding. [ASSUMED: arithmetic from CSS values, no render]. Add a measured assertion instead of trusting it.
11. **Width (estimate).** Labels total 91 characters; at 15px monospace about 9 px/glyph that is about 820 px plus 9 x 22 px padding/border and 8 gaps, about 1070 px against 1216 px usable. Fits with margin [ASSUMED]. Assert all nine buttons share the same `boundingBox().y` at 1280x720 in Chromium (and in Firefox if cheap).
12. **F4 hint/README/contract drift** (see F4 section): `tests/contract/readme.test.ts` and the Controls panel both iterate `ACTION_IDS`.

## Don't hand-roll

| Problem | Use instead |
|---------|-------------|
| Key label text | `labelFor`/`codeLabel` in `src/input/bindings.ts` over the live `bindings` map |
| Availability | `ACTION_CONTEXTS` evaluated against the derived base context (not a second table) |
| Overlay context restore | existing `closeChart`/`closeSaveScreen` (restore `contextBefore*`); never call `setContext` directly from the nav |
| Screen open | `openStationScreen`/`backToHome`/`openChart`/`openSaveScreen`; do not duplicate their state resets |
| Contrast | pick colours with the script approach used above; the existing `#1a5a2c` / `#2a5a35` fail 3:1 |

## Test strategy (all commands Docker-only; compose file is `compose.yaml`)

Harness: Vitest runs one `unit` project with `environment: "node"` and includes `src/**/*.test.ts`, `tests/**/*.test.ts`, `tools/**/*.test.ts` (vitest.config.ts 70-83); there is no DOM environment, and coverage thresholds cover only `src/sim`, `src/persistence`, `src/content`, so `src/ui` is unconstrained. Therefore only the pure registry gets Vitest tests; DOM wiring is proven in Playwright against the production build (`playwright.config.ts`, 1280x720 Chromium; the Firefox project only matches `engine|core-loop`).

| Test | Where | Run |
|------|-------|-----|
| Registry: two-way drift (every live tab has a non-empty `DEFAULT_BINDINGS` entry; every `STATION_SCREEN_ACTIONS` member plus `chart`, `saveLoad`, `launch` has a tab), availability matrix (docked/flight, paused, overlay x base context, launch only on Home), `activeTabId` precedence, hidden slots never rendered, hint derivation, unbound key renders without prefix | new `tests/ui/station-tabs.test.ts` | `docker compose run --rm test npx vitest run tests/ui/station-tabs.test.ts` |
| Interfaces text matches vendored `descriptions.plist` (both keys) | same file or `tests/ui/station-interfaces.test.ts` | same |
| F4 defaults, contexts, `STATION_SCREEN_ACTIONS` membership, Digit4 in `dockHome`/`dockScreen`, F4 inert in flight; reserved set if F1/F4 added | extend `tests/input/bindings.test.ts` (pattern at 353-384, 448-478) and `tests/input/station-actions.test.ts` | `docker compose run --rm test npx vitest run tests/input` |
| README Controls row | `tests/contract/readme.test.ts` (existing, auto) | `docker compose run --rm test npx vitest run tests/contract/readme.test.ts` |
| Browser: click each of the nine tabs updates `probe.station.screen` / `probe.chart.open` / `probe.saveScreen.open` and `aria-current`; chart <-> F2 <-> section transitions; Esc after nav returns to the station screen; F1 `disabled` on every non-Home screen and on both overlays; click Launch tab on Home launches once, no launch from other tabs; focus unchanged and `Digit8` still works after a click; nav hidden on chart in flight, visible on chart when docked; overwrite dialog blocks nav; pending Outfitting `[Y/N]` cleared by a tab click; all nine tabs on one row; chart marker click still selects with nav visible; Interfaces shows the empty text | new `tests/e2e/station-tabs.spec.ts` (reuse `bootToHome`-style helpers from `station.spec.ts:73`; helpers are duplicated per spec today) | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station-tabs.spec.ts --project=chromium"` |
| Smoke in the fast gate | one nav-presence/click assertion in `tests/e2e/scene.spec.ts` (fast gate = scene, docking, save-load per `package.json:19`) or add the new spec to `test:e2e:fast` | `docker compose run --rm verify` |
| Reserved F-key guard for F1/F4 | extend `tests/e2e/station.spec.ts:273` (`codes` at 307) | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station.spec.ts --project=chromium"` |
| Final | `docker compose run --rm verify`, then `docker compose run --rm verify-full` (input and render code change) | |

Existing tests that need review or change:
- `tests/e2e/scene.spec.ts:131-133` (`button[data-action="launch"]` count 1) and `:141-144` (home strings; unchanged if the tiles stay); also `scene.spec.ts:33`, `hud.spec.ts:43`, `launch.spec.ts:62,94,107,145,224`, `settings.spec.ts:31`, `autosave.spec.ts:214` click `button[data-action="launch"]`. All remain valid only if the Launch tab uses a different attribute.
- `tests/e2e/station.spec.ts:621-634` footer-overlap assertion uses `#docked .station-footer`; still valid, extend it to assert the nav is above the section and within the viewport.
- `tests/e2e/station.spec.ts:273-364` reserved-key proof (extend if F1/F4 are added).
- Chart click helpers (`hyperspace.spec.ts:94`, `core-loop.spec.ts:142`, `autosave.spec.ts:232`) are live-box based and should pass unchanged; confirm.
- `tests/contract/readme.test.ts` (new `Interfaces` row), `tests/compliance.test.ts:199` (nav is not `<footer>`; unchanged).
- Prettier: `index.html` and `README.md` are linted.

## Docs to update
- `.planning/PROJECT.md` Key Decisions: strip + Home are deliberate Wegolite additions (Oolite has neither); active-tab re-click is a no-op; F1 Launch only on Home; F4 text literal source.
- `FIDELITY.md` is a strictly validated table (`tests/contract/fidelity.test.ts`): every row needs a `src/...:line` Wegolite cell, an `src/Core/...:a-b` Oolite cell, a verbatim excerpt (at most 20 lines) pinned to commit `7437f22`, and a divergence row must quote a PROJECT.md Key Decisions row. Its scope sentence limits it to the launch/flight/dock/trade/outfit/hyperspace loop. Recommend recording the divergence in PROJECT.md only, unless the owner wants a new E-27 row (see Open Questions).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Chrome and Firefox open their help page on a plain F1 keydown that is not `preventDefault`ed | F4 / reserved keys | Low: adding F1 to `RESERVED_F_KEYS` is harmless either way; only the justification changes |
| A2 | Plain F4 has no browser default worth guarding | F4 / reserved keys | Low: guard is optional |
| A3 | Monospace glyph at 15px is about 9 px wide in the Playwright image | Pitfalls 10-11 | Medium: a wrap at 1280 would fail the no-wrap test; resolve by measurement in the new e2e |
| A4 | Vertical numbers (header 56 px, footer about 102 px) | Pitfall 10 | Low: only affects how tight the layout looks; e2e measures real boxes |

## Open Questions

1. **FIDELITY.md row or PROJECT.md only?** Recommendation: PROJECT.md only (UI chrome is outside FIDELITY's stated scope and a row needs a verbatim pinned-commit excerpt). Owner can opt in to E-27.
2. **Add F1/F4 to `RESERVED_F_KEYS`?** Recommendation: yes (small, testable, and the strip makes F1 conspicuous). Needs owner confirmation only because it widens the browser-key interception from six to eight keys.
3. **Do Home tiles become clickable?** Left to discretion by CONTEXT; cheap through the same `navigateStation` sink with `tabindex="-1"`, but `.station-entry` would need `cursor:pointer` and a `data-nav-tab`. Not required for the task.

## Sources

### Primary (HIGH, read this session)
- `/home/opencode/git/wegolite/index.html` (CSS 127-631, markup 668-811), `src/ui/station.ts`, `src/ui/chart.ts`, `src/ui/save-load.ts`, `src/ui/docked.ts`, `src/app/game-session.ts` (ranges cited above), `src/app/probe.ts` (104-215), `src/input/actions.ts`, `src/input/keyboard.ts`, `src/input/bindings.ts`, `src/main.ts` (100-140), `vitest.config.ts`, `playwright.config.ts`, `compose.yaml` (verify chain), `package.json` scripts.
- Tests read or searched: `tests/e2e/station.spec.ts`, `scene.spec.ts`, `hyperspace.spec.ts`, `core-loop.spec.ts`, `autosave.spec.ts`, `tests/e2e/helpers/*`, `tests/input/*`, `tests/contract/readme.test.ts`, `tests/contract/fidelity.test.ts`.
- Oolite: `src/Core/Entities/PlayerEntityControls.m:376, 4019-4025`, `src/Core/Entities/PlayerEntity.m:8586-8625`, `Resources/Config/descriptions.plist:1904-1907`; vendored `third_party/oolite/Config/descriptions.plist:1860-1861`; `tools/oolite-ingest/convert/labels.ts`, `src/content/schemas/labels.ts`.

### Tertiary (LOW)
- Browser default for F1/F4 (training knowledge, tagged A1/A2).

## Metadata
**Research date:** 2026-11-09 **Valid until:** until `game-session.ts` / `actions.ts` change materially (about 7 days of active work in these files).
