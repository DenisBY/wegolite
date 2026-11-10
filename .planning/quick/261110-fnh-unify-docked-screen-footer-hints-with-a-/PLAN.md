---
phase: quick-261110-fnh
plan: 261110-fnh
type: execute
wave: 1
depends_on: []
files_modified:
  - index.html
  - src/ui/station-footer.ts
  - src/ui/station-hints.ts
  - src/ui/station.ts
  - src/ui/chart.ts
  - src/ui/save-load.ts
  - src/app/game-session.ts
  - tests/ui/station-footer.test.ts
  - tests/ui/station-hints.test.ts
  - tests/e2e/station-tabs.spec.ts
  - tests/e2e/station.spec.ts
  - tests/e2e/autosave.spec.ts
  - tests/e2e/core-loop.spec.ts
  - tests/e2e/save-load.spec.ts
  - tests/e2e/hyperspace.spec.ts
  - tests/e2e/dispose.spec.ts
  - .planning/PROJECT.md
  - CHANGELOG.md
autonomous: true
requirements: []
gap_closure: false
must_haves:
  truths:
    - "The #docked, #chart and #save-load overlays each have exactly one .station-footer with exactly two always-present lines (hints first, status second); the footer height does not change when the status text appears or clears."
    - "The status line renders exactly one of confirm, notice, save or info by priority confirm > notice > save > info; a failed autosave never clears a pending [Y/N], and its save text is revealed again once the confirm clears."
    - "Every key label in all three footers comes from the live binding map; a rebind updates the footer without a reload, and the default status hint still contains 'Tab/PageDown next page'."
    - "The F6 chart canvas and the #station-screen/#save-load-screen content end above the in-flow footer at 1280x720; the footer no longer occludes the plot."
    - "The Save/Load overwrite alertdialog still opens over the footer, keeps Cancel focused, traps Tab and returns focus to #save-load-screen when it closes."
    - "The document keeps exactly one <footer>; all three station footers remain div.station-footer and [hidden] still hides an overlay and its footer together."
  artifacts:
    - "index.html carries one inert <template id=\"station-footer-template\"> and no inline station-footer markup in any overlay."
    - "src/ui/station-footer.ts exports the pure priority resolver and createStationFooter(host)."
    - "src/ui/station-hints.ts exports dockedHints, chartHints and saveLoadHints."
    - "Unit tests cover priority/tone/empty handling, the template contract and default/rebound hint strings."
    - "Browser tests cover two-line reserved height, live rebind refresh, chart canvas/footer bounds, save-load dialog/focus and footer disposal."
    - ".planning/PROJECT.md and CHANGELOG.md record the change and supersede the footer part of deferred D-25."
  key_links:
    - "template clone -> createStationFooter -> one mount in station.ts, chart.ts and save-load.ts"
    - "binding map -> station-hints.ts -> footer.setHints -> refreshStationChrome after every rebind"
    - "session confirmText/noticeText/saveText -> footer.setStatus parts -> resolveFooterStatus -> one status line"
    - "#chart flex column + #chart-canvas flex:1/min-height:0 -> ResizeObserver -> handleResize -> repaint at the shrunken size"
    - "save-load setConfirming -> footer confirm part -> #save-load-confirm alertdialog -> existing focus trap"
---

# Quick task 261110-fnh: unify the docked, chart and Save/Load footer

## Goal and why

The three docked overlays currently build their bottom area three different ways:

- `#docked` writes four independent footer fields (`station-keys`, `station-confirm`, `station-notice`, `station-save`), so the footer is four reserved lines.
- `#chart` uses a fixed footer at `bottom: 2rem` and three separate readout fields (`chart-target`, `chart-distance`, `chart-fuel`) plus `chart-keys`; the fixed footer sits over the canvas and occludes roughly 11–20 % of the plot at 1280x720.
- `#save-load` has its own `save-load-keys` and `save-load-confirm` fields under a second fixed footer.

The three hint sources are hard-coded (`keyHints()` in `game-session.ts`, `KEY_HINT` in `chart.ts`, `KEY_HINTS` in `save-load.ts`), so they go stale after a rebind.

**Goal:** one inert `<template>` and one small component give all three overlays the same two-line footer: a dim green live key-hint line above one amber/status line. Both lines are always present and always reserve the same height. The three overlays stay separate; this is Option A only. Do not build `createStationChrome` and do not merge chart/save-load into the station shell.

**Branch:** `refactor/station-footer-template` is already checked out. Do not create a branch or worktree. The user wants this branch so the change can be reverted.

## Locked design contract

- **Two reserved lines, never a jumping footer.** Hints first, status second. The status `<p>` is never `hidden`; an empty status is an empty reserved line.
- **Status priority is strict:** `confirm > notice > save > info`. Parts are independent; updating `save` never clears `confirm`.
- **Bindings are the only key source.** Every literal key name in footer hints is replaced with a label derived from the live binding map.
- **The chart canvas must stop being occluded.** Its footer enters normal flow; the canvas resizes above it and repaints.
- **Save/Load keeps its own screen and its alertdialog/focus path.**
- **No new dependency, no `src/sim` change, no DOM unit-test environment.** Vitest is Node-only in this repo (`vitest.config.ts` has one `unit` project with `environment: "node"`; jsdom/happy-dom are not installed). The component's DOM half is proved in Playwright; the pure resolver and the HTML template contract are proved in Vitest.
- **Execution constraints.** Tests, builds and typecheck run in Docker only; a green host `npm` run is not evidence. Explore with the codebase-memory project `wegolite` first (`search_graph`, `trace_path`, `get_code_snippet`); fall back to `rg` for literals, config and non-code files, and confirm important findings against the source. Any scratch reproduction must live under `/tmp` and be mounted into the container (`-v /tmp/<dir>:/scratch`); never add scratch files to the repository. Do not create a branch or worktree.

## Files and intended shape

| File | Intended change |
|---|---|
| `index.html` | Add `#station-footer-template`; remove the three inline `.station-footer` divs; move `.station-footer` to an in-flow two-line flex column; role/tone colors; remove the fixed chart/save-load footer rules and old `data-field` footer colors; reduce `#save-load-screen` bottom padding and add `min-height: 0`. |
| `src/ui/station-footer.ts` (new) | Pure `resolveFooterStatus(parts)` + `FOOTER_STATUS_PRIORITY`; `createStationFooter(host)` clones the template, appends one footer, returns `setHints`, `setStatus` (merge semantics), `element`, `dispose`. No module-scope DOM access. |
| `src/ui/station-hints.ts` (new) | Pure `dockedHints(bindings, screen)`, `chartHints(bindings)`, `saveLoadHints(bindings)`; compact labels from `primaryKeyLabel`/`codeLabel`; no DOM, no Three.js. |
| `src/ui/station.ts` | Remove the four footer-field lookups; mount one footer; map `keysText`/`confirmText`/`noticeText`/`saveText`; dispose the footer. Header/nav/five panels untouched. |
| `src/ui/chart.ts` | Remove `KEY_HINT` and the four footer-field lookups; mount one footer; combine target/distance/fuel into one info status line; add `setHints`; dispose the footer; keep/extend the canvas `ResizeObserver` so the in-flow footer triggers a resize repaint. |
| `src/ui/save-load.ts` | Remove `KEY_HINTS` and the two footer-field lookups; mount one footer; write the overwrite prompt through the `confirm` part; add `setHints`; dispose the footer. Dialog/focus logic unchanged. |
| `src/app/game-session.ts` | Delete `keyHints()`; compute docked hints from `dockedHints`; push `chartHints`/`saveLoadHints` after bindings exist and from `refreshStationChrome()`; keep the existing `confirmText`/`noticeText`/`saveText` computation. |
| `tests/ui/station-footer.test.ts` (new) | Priority/tone/empty/merge-semantics resolver tests; `index.html` template contract (one template, two `<p>`s in order, one document `<footer>`). |
| `tests/ui/station-hints.test.ts` (new) | Exact default strings for all five docked screens, chart and save-load; rebind behavior; unbound fallback. |
| `tests/e2e/station-tabs.spec.ts` | Docked footer selectors; hints one-line and status reserved-height checks; live-rebind test; chart canvas/footer bounds and backing-store test; per-overlay footer count. |
| `tests/e2e/station.spec.ts` | Replace `station-confirm`/`station-notice`/`station-save` with the scoped status line; adapt the empty/notice expectations. |
| `tests/e2e/autosave.spec.ts` | Replace the station footer fields with the status line; rewrite the confirm+failed-save case to prove priority and resurfacing. |
| `tests/e2e/core-loop.spec.ts` | Replace the `station-confirm` selector. |
| `tests/e2e/save-load.spec.ts` | Replace `save-load-confirm` with `#save-load [data-footer-role="status"]`; add tone/height assertions. |
| `tests/e2e/hyperspace.spec.ts` | Replace `chart-distance`/`chart-fuel` with the combined chart status line. |
| `tests/e2e/dispose.spec.ts` | After `pagehide`, assert no `.station-footer` remains (component disposal). |
| `.planning/PROJECT.md` | New Key Decision row; update the "Last updated" line; note it supersedes the footer part of deferred D-25. |
| `CHANGELOG.md` | One `Changed` and one `Fixed` entry under `## [Unreleased]`. |

## Task 1 — Add the template, the shared footer component and the live hint builder

**Depends on:** nothing. This task is additive; the app keeps using the old inline footers.

**Files:** `index.html`, `src/ui/station-footer.ts` (new), `src/ui/station-hints.ts` (new), `tests/ui/station-footer.test.ts` (new), `tests/ui/station-hints.test.ts` (new).

### 1a. Template

Insert this inert template in `index.html` immediately before `<div id="docked" hidden>`:

```html
<template id="station-footer-template">
  <div class="station-footer" data-station-footer>
    <p data-footer-role="hints"></p>
    <p data-footer-role="status" data-status-tone="" role="status"></p>
  </div>
</template>
```

Keep `body > footer` as the only `<footer>` element. The template is not rendered and must not contain a `<footer>`.

### 1b. `src/ui/station-footer.ts`

- Export `FooterStatusTone = "confirm" | "notice" | "save" | "info"`, `FooterStatusParts` (all four optional strings), `FOOTER_STATUS_PRIORITY` in the order above, and `resolveFooterStatus(parts): { text: string; tone: FooterStatusTone | "" }`.
- `resolveFooterStatus` returns the first part whose text is non-empty, with its tone; otherwise `{ text: "", tone: "" }`. Preserve the exact text (no trimming of the displayed value); an empty/whitespace-only part counts as absent.
- Export `StationFooter` with `element`, `setHints(text)`, `setStatus(parts)`, `dispose()`.
- `setStatus` **merges**: a provided string (including `""`) replaces that part; an omitted key leaves the existing part untouched. This is what keeps a failed autosave from clearing a pending confirm.
- `setHints` and `setStatus` write only with `textContent` and only when the string/tone actually changed, so repeated renders do not spam the live region or force layout.
- `createStationFooter(host)` looks up `#station-footer-template` (inside the function, never at module scope so the Node test can import the resolver), validates it is an `HTMLTemplateElement`, clones `template.content`, finds `[data-station-footer]`, appends it to `host`, and returns the API. Throw a clear `Wegolite: the station footer template is missing or malformed.` error when absent.
- Never toggle `hidden`/`display` on either line. The empty status line remains in flow.
- `dispose()` removes the mounted footer and is idempotent.

### 1c. `src/ui/station-hints.ts`

Pure TypeScript only. Use `primaryKeyLabel(map, action)` for single-key/primary actions and `codeLabel` for multi-code actions. Compact `codeLabel` output by stripping the `" arrow"` suffix (`Up arrow` -> `Up`), and join multiple codes with `/` (no spaces) so the status hint keeps the exact substring `Tab/PageDown next page`.

Default strings (pin them in the unit test):

| Screen | Default hints |
|---|---|
| home | `1 launch · P pause` |
| market | `Up/Down select · Right buys +1 · Left sells +1 · Shift max · Enter/Y confirm · N cancel · Esc back · P pause` |
| outfitting | `Up/Down select · Enter/Y confirm · N cancel · Esc back · P pause` |
| status | `Tab/PageDown next page · PageUp previous · Esc back · P pause` |
| interfaces | `Esc back · P pause` |
| chart | `Click: select · Up/Down/Left/Right: next · Tab: preset · Enter: commit · Esc: close` |
| save/load | `Up/Down select · Enter activate · Y confirm · N cancel · S save · L load · Esc return` |

Use `primaryKeyLabel` for `launch`, `pause`, `stationBack`, `chartBack`, `saveScreenReturn` and every single-code arrow/range action. Use the compact all-code join for `stationPageNext` (`Tab/PageDown`) and `stationConfirm` (`Enter/Y`). `Shift max` stays literal because Shift is a modifier, not a bindable action. An unbound action renders `(unbound)`.

Rebind expectations: `stationUp -> KeyW` changes `Up/Down` to `W/Down`; `stationConfirm -> KeyK` changes `Enter/Y confirm` to `K confirm`; `pause -> KeyO` changes `P pause` to `O pause`; `chartRange -> KeyG` changes `Tab: preset` to `G: preset`; `saveScreenSave -> KeyK` changes `S save` to `K save`.

### 1d. Unit tests

`tests/ui/station-footer.test.ts`:

- Confirm `resolveFooterStatus` picks confirm over all, notice over save/info, save over info, and info alone; asserts the matching tone.
- Empty and whitespace-only parts produce `{ text: "", tone: "" }`.
- Exact text is preserved (including `[Y/N]`).
- Read `index.html` with `node:fs`; strip the `<style>…</style>` block before counting tags because a CSS comment mentions `<footer>`; then assert: exactly one `<template id="station-footer-template">`; it contains one `[data-station-footer]`; exactly two `<p>` elements, hints before status; status has `data-status-tone=""` and `role="status"`; the template contains no `<footer`; the body contains exactly one `<footer` opening tag.

`tests/ui/station-hints.test.ts`:

- Pin all seven default strings above exactly.
- Rebind cases from 1c.
- Unbound fallback (`(unbound)`).
- Prove the output has no literal `ArrowUp`/`ArrowDown`/`Escape`/`PageDown` code names; it shows their display labels.

**Verify:**

```bash
docker compose run --rm test npx vitest run tests/ui/station-footer.test.ts tests/ui/station-hints.test.ts
docker compose run --rm typecheck
```

**Done:** the new pure tests and typecheck pass; the running app still uses its old footers. Commit `feat: add a shared station footer template and live hint builder`.

## Task 2 — Move #docked onto the shared footer and update its browser proofs

**Depends on:** Task 1.

**Files:** `index.html`, `src/ui/station.ts`, `src/app/game-session.ts`, `tests/e2e/station-tabs.spec.ts`, `tests/e2e/station.spec.ts`, `tests/e2e/autosave.spec.ts`, `tests/e2e/core-loop.spec.ts`.

### 2a. `station.ts`

- Delete the four `requireElement` calls for `station-keys`, `station-confirm`, `station-notice` and `station-save`.
- Mount one `createStationFooter(root)` and keep the returned API in the shell closure.
- In `render`, call `footer.setHints(view.keysText)` and `footer.setStatus({ confirm: view.confirmText, notice: view.noticeText, save: view.saveText })`. Pass all three every render so a cleared part is cleared in the component.
- In `dispose`, call `footer.dispose()` before/after `home.dispose()`; do not remove the overlay.
- Update the module comment: one footer, two lines, independent parts, priority; the failed-autosave guarantee.

### 2b. `game-session.ts`

- Delete the `keyHints()` function (around lines 850–868).
- Import `dockedHints` from `../ui/station-hints.js`.
- In `renderStation`, set `keysText: dockedHints(bindings ?? DEFAULT_BINDINGS, stationScreen)`.
- Keep the `confirmText`, `noticeText` and `saveText` computation exactly as it is; the component now decides which one is visible.
- Leave `refreshStationChrome()` as render-docked + sync-nav in this task; chart/save-load hint refresh arrives in Task 3.

### 2c. `index.html` (#docked only)

- Remove the inline `<div class="station-footer">…</div>` block inside `#docked`.
- Keep the base `.station-footer` fixed for chart/save-load until Task 3. Add/keep `#docked .station-footer` as the in-flow variant: `position: static; display: flex; flex-direction: column; flex: 0 0 auto;`.
- Add the new role styles now: `[data-footer-role="hints"]` -> `color:#9a9; font-size:.85em`; `[data-footer-role="status"][data-status-tone="confirm"]` -> `#ffd966`; `notice` -> `#9c9`; `save`/`info` -> `#9a9`.
- Keep both footer `<p>`s at `min-height:1.5em; margin:0;` and add `line-height:1.5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;` so an empty line and a text line have the same height (the inherited `1.6` line-height would otherwise make a text line taller than an empty reserved line).
- Remove the old `.station-footer [data-field="station-notice"]` and `[data-field="station-save"]` color rules.
- Keep `#docked { padding-bottom: 6rem; }` unchanged: it reserves the document disclaimer strip.
- Do not change `body > footer`, `[hidden]`, the header, nav or panels.

### 2d. Browser tests

- `station-tabs.spec.ts`:
  - `keys` becomes `#docked [data-footer-role="hints"]`.
  - The line ~177 `#docked .station-footer` bounding box and the line ~627 footer box are already scoped; keep them scoped and keep the nav/section/footer ordering assertions.
  - Keep the one-line assertion `< 36px` and the `#station-screen` bottom <= footer top assertion.
  - Add: `#docked .station-footer` has count 1 and exactly two `[data-footer-role]` children; the empty status `<p>` is at least one line tall; measure the footer height on home with empty status, then press `ArrowRight` on market to raise the confirm and assert the footer height and the status `<p>` height change by at most 1 px; assert the status has `data-status-tone="confirm"` and no child elements.
  - Keep `toContainText("Tab/PageDown next page")` on status and the negative "outfitting"/"market" assertions.
  - Change the two `station-confirm` assertions (lines ~283/~289) to the scoped status locator.
  - Add a test that rebinds `stationConfirm` to `KeyK` through pause -> Controls -> Rebind -> Back -> Resume, then asserts the market footer hints contain `K confirm` and not `Enter/Y confirm`. In the same test, rebind `chartRange` to `KeyG`, open the chart and assert the chart hints contain `G: preset` (proves `refreshStationChrome` pushes to more than one overlay).
- `station.spec.ts`: replace every `[data-field="station-confirm"]` with `#docked [data-footer-role="status"]`. Replace the two-line `confirm empty` + `notice "Requires TL 9"` pair around lines 419–420 with one status assertion `Requires TL 9` plus `data-status-tone="notice"`. Keep the other empty-status assertions (confirm/notice/save are all empty in those flows). Keep the line ~587 one-document-footer count and the line ~602 `#docked .station-footer` no-overlap assertion; they remain valid and must stay scoped.
- `docking.spec.ts` needs no selector change: line ~402 already scopes `dockedPanel.locator(".station-footer")`. Keep it scoped (no `.first()`) and run the spec in the verification command.
- `autosave.spec.ts`: replace `station-save`/`station-confirm` with `#docked [data-footer-role="status"]`. The read-only and failed-write cases assert the status text and tone. Rewrite the confirm+failed-save case around lines 1283–1286: after `ArrowRight`, assert the status shows `Buy …` with tone `confirm`; press `KeyN`; assert the status now shows `Save failed — progress not saved` with tone `save` — this proves the confirm survived the failed autosave and the save part was retained independently.
- `core-loop.spec.ts`: replace the `station-confirm` selector with `#docked [data-footer-role="status"]`; the regex is unchanged.

**Verify:**

```bash
docker compose run --rm typecheck
docker compose run --rm test npx vitest run tests/ui/station-footer.test.ts tests/ui/station-hints.test.ts tests/ui/station-tabs.test.ts
docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station-tabs.spec.ts tests/e2e/station.spec.ts tests/e2e/autosave.spec.ts tests/e2e/core-loop.spec.ts"
```

**Done:** `#docked` has the two-line shared footer, its status priority is proved, hints are live and the chart/save-load overlays still behave as before. Commit `refactor: move the docked footer onto the shared two-line component`.

## Task 3 — Move #chart and #save-load onto the shared footer, finish the layout, tests and docs

**Depends on:** Task 2.

**Files:** `index.html`, `src/ui/chart.ts`, `src/ui/save-load.ts`, `src/app/game-session.ts`, `tests/e2e/station-tabs.spec.ts`, `tests/e2e/save-load.spec.ts`, `tests/e2e/hyperspace.spec.ts`, `tests/e2e/dispose.spec.ts`, `.planning/PROJECT.md`, `CHANGELOG.md`.

### 3a. `chart.ts`

- Delete `KEY_HINT` and the `chart-target`/`chart-distance`/`chart-fuel`/`chart-keys` lookups.
- Mount one `createStationFooter(overlay)` and add `setHints(text)` to the `ChartOverlay` interface. `setHints` writes through to the footer.
- `renderReadout` becomes one status line: `${target} · ${distance} · ${fuel}` where target is `No system` and the other two are `--` when there is no readout; include the existing `(reason)` suffix. Call `footer.setStatus({ info: text })`. The old separate amber target line is intentionally replaced by the single info-tone line; do not add a second status line.
- `dispose` calls `footer.dispose()`.
- Canvas sizing: mount the footer before the canvas observer is created. Keep `#chart-canvas { flex:1; min-height:0 }`. Extend the existing `ResizeObserver` to observe both the canvas and the footer element (with the existing window-resize fallback), so a footer reflow also runs `handleResize`, which rebuilds the view at the new viewport and repaints. Do not assume the canvas auto-adjusts.
- The chart never writes hints; the session pushes them.

### 3b. `save-load.ts`

- Delete `KEY_HINTS` and the `save-load-keys`/`save-load-confirm` lookups.
- Mount one `createStationFooter(overlay)` and add `setHints(text)` to `SaveLoadScreen`.
- In `setConfirming(next)`, call `footer.setStatus({ confirm: next ? "Overwrite the autosave? [Y/N]" : "" })`. Never hide the status line.
- `dispose` calls `footer.dispose()`.
- Leave the dialog, focus trap, `#save-load-screen` focus return, row navigation and handlers unchanged.
- The in-section `save-load-notice` stays where it is; only the footer prompt moves into the shared footer.

### 3c. `game-session.ts`

- Import `chartHints` and `saveLoadHints`.
- Extend `refreshStationChrome()`:
  - `chart?.setHints(chartHints(bindings ?? DEFAULT_BINDINGS));`
  - `saveLoad?.setHints(saveLoadHints(bindings ?? DEFAULT_BINDINGS));`
  - keep `if (state?.mode === "docked") renderStation();` and `syncStationNav();`.
- Call `refreshStationChrome()` once after `bindings = bindingMap` in `start()` so both overlays get their default hints before first open. This also covers a restored in-flight session where `renderStation()` does not run.
- Do not change `setSaveNotice`, the save snapshot queue or the station `saveText` computation; the priority component handles the rest.

### 3d. `index.html` (chart/save-load/base)

- Remove the inline `.station-footer` blocks from `#chart` and `#save-load`.
- Move `.station-footer` to the canonical in-flow form: `position: static; display:flex; flex-direction:column; flex:0 0 auto;` with the existing border, background, font, padding and color. Remove the `#docked .station-footer` special case (the base is now the same).
- Delete `#chart .station-footer { bottom: 2rem; }` and `#save-load .station-footer { bottom: 2rem; }`, plus all old `[data-field="chart-*"]` and `[data-field="save-load-*"]` footer color rules.
- `#chart-canvas` keeps `flex:1; min-height:0`. `#save-load-screen` keeps `flex:1; overflow-y:auto`, gains `min-height:0`, and its padding becomes `1rem 2rem` (drop the `12rem` bottom reservation).
- Do **not** add bottom padding to `#chart` or `#save-load`: they are full-screen `z-index:10` overlays that cover the document disclaimer today, and the footer should be the last in-flow row. Only `#docked` keeps its `6rem` strip.
- The Save/Load dialog (`#save-load-confirm`) keeps `position:absolute; inset:0; z-index:2`, so it still covers the footer while open.
- Keep `body > footer` and `[hidden]` untouched.

### 3e. Browser tests

- `hyperspace.spec.ts`: replace the `chart-distance`/`chart-fuel` assertions with `#chart [data-footer-role="status"]`; assert it contains `Diso`, the distance text and `fuel units` (the old `--` fallback is covered by the unit/API contract).
- `save-load.spec.ts`: replace `[data-field="save-load-confirm"]` with `#save-load [data-footer-role="status"]`; assert the confirm text and `data-status-tone="confirm"`, then after cancel assert empty status and an unchanged status-line height. Keep every existing focus assertion (`#save-load-confirm-cancel` focused, `#save-load-screen` focused after close).
- `station-tabs.spec.ts`: add a chart footer test — open the chart, assert `#chart .station-footer` count 1 and `getComputedStyle(footer).position === "static"`, `canvas.y + canvas.height <= footer.y + 1`, `footer.y + footer.height <= innerHeight + 1`, and the canvas backing store height equals `Math.round(canvas.clientHeight * Math.min(devicePixelRatio, 2))`; assert the chart hints contain `Tab: preset`. Open Save/Load and assert `#save-load .station-footer` count 1, `#save-load-screen` bottom <= footer top + 1, and the hints contain `Esc return`.
- `dispose.spec.ts`: in the `pagehide` test, after dispatching `pagehide`, assert `page.locator(".station-footer")` has count 0 (all three component instances removed).
- Scope every `.station-footer` locator with `#docked`, `#chart` or `#save-load`; the bare locator matches three elements and is a strict-mode failure. Do not silence it with `.first()`.

### 3f. Docs

- `.planning/PROJECT.md`: add one Key Decision row, for example: **Unify the docked, chart and Save/Load footer on one two-line template with live key labels** — the chart's fixed footer occluded the plot, the docked footer reserved four lines and three hard-coded hint sources went stale after a rebind; one inert template plus `createStationFooter` reserves exactly two lines and `station-hints.ts` derives every label from the live binding map, with status parts rendered by priority `confirm > notice > save > info` so a failed autosave cannot clear a pending `[Y/N]`. Outcome: ✓ Quick task 261110-fnh — template, component, hint builder, unit tests and 1280x720 browser proofs; supersedes the footer part of deferred D-25. Update the "Last updated" line to mention this task.
- `CHANGELOG.md`, under `## [Unreleased]`:
  - `Changed`: the docked station, F6 chart and F2 Save/Load screens share one two-line footer with live key hints above a single status line; the footer height no longer changes when a confirmation or save notice appears.
  - `Fixed`: the F6 chart plot is no longer partly hidden under the footer; the canvas and the station/save-load content end above it at 1280x720.

### 3g. Final verification

Run, from the repository root, in Docker only:

```bash
docker compose run --rm typecheck
docker compose run --rm lint
docker compose run --rm test
docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/station-tabs.spec.ts tests/e2e/station.spec.ts tests/e2e/autosave.spec.ts tests/e2e/docking.spec.ts tests/e2e/save-load.spec.ts tests/e2e/hyperspace.spec.ts tests/e2e/core-loop.spec.ts tests/e2e/dispose.spec.ts"
docker compose run --rm verify
```

`verify` is the everyday gate (lint, typecheck, content drift, unit, build, e2e smoke subset). Run `docker compose run --rm verify-full` before merge if time allows: the chart layout is visual and CI runs the full Chromium suite. A green host `npm` run is not evidence.

**Done:** all three overlays use the shared footer, the chart canvas is fully above the footer at 1280x720, the Save/Load dialog/focus path is unchanged, docs are updated, and every command above is green. Commit `refactor: unify the station chart and save-load footers` (include the CHANGELOG/PROJECT decision in the same implementation commit as requested).

## Risks and edge cases

- **Footer height at 1280x720.** The market hint is the longest line. Keep it one line: hints are `.85em`, `white-space:nowrap`, `overflow:hidden`, `text-overflow:ellipsis`; both `<p>`s use `line-height:1.5` with `min-height:1.5em` so empty and text lines are identical in height. The browser test measures hints `< 36px` and the footer height before/after a confirm (<= 1px change).
- **Chart occlusion.** The fixed footer is the blocker. Prove the fix, not the CSS intent: canvas bottom <= footer top, footer inside the viewport, computed `position: static`, and the backing store matches the shrunken CSS size.
- **`#docked` padding-bottom.** Keep the `6rem` strip; assert `#station-screen` ends above the footer and the footer does not overlap `body > footer`. Do not copy the `6rem` strip to the chart/save-load overlays.
- **Save/Load alertdialog.** It is absolutely positioned over the whole overlay and must stay above the footer. The footer must not enter the focus trap; the status line is a `<p role="status">`, never focusable. Existing Cancel-focus, Tab-trap and focus-return tests must stay green.
- **Rebinding.** `refreshStationChrome()` is the single refresh path. It must push hints to `#docked`, `#chart` and `#save-load`, and run on every controls change and on reset. The unit tests pin all strings; the browser test proves the live path.
- **Autosave failure while a confirm is pending.** Priority is the guarantee. `setStatus` must merge, not replace; the autosave callback writes only `stationSaveNotice`; `renderStation` passes all three parts; the status line shows confirm until it clears, then reveals the retained save error.
- **`[hidden]` overlays.** Each footer is cloned inside its overlay, so hiding the overlay hides both lines. Never put a footer at document scope and never toggle `hidden` on the lines.
- **Document footer.** Keep exactly one `<footer>` at the end of `body`; all station footers remain `div.station-footer`. The chart/save-load overlays keep covering the document disclaimer as they do today; only `#docked` reserves the strip. Do not add a second footer.
- **Strict `.station-footer` locator.** Three instances always exist in the DOM. Every test locator must be scoped by overlay id; a bare locator is a strict-mode error.
- **Chart readout consolidation.** Target, distance and fuel become one `info` line. The target loses its separate amber color; this is intentional under the one-status-line contract. Do not add a second line or a second footer.
- **No implementation escapes.** `src/sim/` stays pure (no DOM/Three.js); this task changes UI only. No `createStationChrome`, no chart/save-load merge, no tab-registry/nav behavior change, no new dependency.

## Out of scope

- Building a full `createStationChrome` or merging `#chart`/`#save-load` into `#docked`.
- Changing the station header, nav, tab registry, five panels, save semantics or rebinding UI.
- Changing `src/sim/`, persistence, rendering, HUD or content.
- Adding jsdom/happy-dom or a browser-mode Vitest project.
- Pixel/screenshot comparisons.

## Done criteria

- [ ] `index.html` has one `<template id="station-footer-template">` and no inline `.station-footer` markup.
- [ ] `#docked`, `#chart` and `#save-load` each have exactly one `.station-footer` with hints then status, both always present.
- [ ] Footer height is stable with an empty status and with a confirm; no line wraps at 1280x720.
- [ ] Status priority `confirm > notice > save > info` is unit-tested and browser-proved; failed autosave + pending confirm behaves correctly.
- [ ] All default hint strings and rebind behavior are unit-tested; `Tab/PageDown next page` is preserved.
- [ ] The chart canvas ends above the footer, its backing store matches its CSS size, and the plot is no longer occluded.
- [ ] Save/Load alertdialog focus behavior is unchanged.
- [ ] Exactly one document `<footer>` remains; `[hidden]` still works.
- [ ] `docker compose run --rm verify` and the targeted Docker e2e specs pass.
- [ ] `CHANGELOG.md` and `.planning/PROJECT.md` record the change; `.planning/PROJECT.md` notes the supersession of the footer part of D-25.
- [ ] No `src/sim/` changes and no new dependencies.
