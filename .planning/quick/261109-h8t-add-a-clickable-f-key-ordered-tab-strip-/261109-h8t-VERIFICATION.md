---
phase: quick-261109-h8t
verified: 2026-11-09T14:30:00Z
status: passed
score: 12/12 must-haves verified
covered_files:
  - ".planning/quick/261109-h8t-add-a-clickable-f-key-ordered-tab-strip-/261109-h8t-PLAN.md"
  - ".planning/quick/261109-h8t-add-a-clickable-f-key-ordered-tab-strip-/261109-h8t-SUMMARY.md"
  - "index.html"
  - "src/app/game-session.ts"
  - "src/input/actions.ts"
  - "src/ui/station-model.ts"
  - "src/ui/station-nav.ts"
  - "src/ui/station-tabs.ts"
  - "src/ui/station.ts"
  - "tests/e2e/station-tabs.spec.ts"
  - "tests/ui/station-tabs.test.ts"
covered_digest: "v4:sha256:94b720f2e8a387c4e1b4aaece9a22bb890499be12ec71deb909c64a07902a0dd"
behavior_unverified: 0
overrides_applied: 0
---

# Quick Task 261109-h8t: Verification Report

**Goal:** Add a clickable F-key-ordered tab strip to the docked station computer (Home, F1 Launch, F2 Save/Load, F3 Outfitting, F4 Interfaces, F5 Status, F6 Chart, F7 System data, F8 Market).
**Verified:** 2026-11-09
**Status:** passed
**Re-verification:** No, initial verification

I read the code at HEAD (commits db2bce8, 68436a9, 8564ded). I did not rely on SUMMARY.md. I confirmed behaviour with targeted Docker runs: Vitest, typecheck, lint and 11 targeted Playwright tests. I did not run verify-full (~27 min). I took the executor's green verify-full report as given and did not re-prove it.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One strip in F-key order. The key text is read from the live bindings. Shipyard and Market Info are hidden slots and never rendered. | VERIFIED | `src/ui/station-tabs.ts:69-115`: `STATION_TAB_REGISTRY` is home, launch, saveLoad, outfitting, (shipyard hidden), interfaces, status, chart, systemData, market, (marketInfo hidden). `liveStationTabs()` filters `status === "live"`. `tabText` and `tabKeyLabel` read a `BindingLookup`. `station-nav.ts` renders only `liveStationTabs()`. Unit drift tests pass (20 tests). The e2e order test passes. |
| 2 | F4 is a full action. The Interfaces screen uses Oolite text. A Vitest guard checks the plist. | VERIFIED | `actions.ts` has `stationInterfaces` in the ActionId union (:31), ACTION_IDS (:103), DEFAULT_BINDINGS `["F4","Digit4"]` (:169), ACTION_LABELS "Interfaces" (:225), ACTION_CONTEXTS `dockHome, dockScreen` (:352) and STATION_SCREEN_ACTIONS (:372). The StationScreen union (`station.ts:33`), the probe union (`probe.ts:116`), the index.html panel (:849-851) and the README row (`README.md:78`) are all updated. `descriptions.plist:1860-1861` holds both strings verbatim. `station-interfaces.test.ts` passes (2 tests) and `readme.test.ts` passes (21 tests). |
| 3 | Launch is enabled only on Home with no overlay. The Launch tab has no `data-action`. A Launch click queues the launch command. | VERIFIED | `isTabEnabled` (:160-175) requires `overlay === "none"` and `base === "dockHome"` for launch. The tab buttons are created in `station-nav.ts` with only `dataset.stationTab`, and `rg data-action index.html` finds only the Home button (:786). `navigateStation` pushes `{kind:"launch"}`. The e2e tests "Launch tab launches only from Home" and the docking smoke (`[data-action]` count 0, `button[data-action=launch]` count 1) pass. |
| 4 | Clicks route through the existing open paths, close an overlay first, and make a re-click of the active tab a no-op. The screen under an overlay keeps its state. | VERIFIED | `game-session.ts:1626-1668`: it returns on `tabId === activeTabId(nav)`. It calls `closeChart()` or `closeSaveScreen()` first. It calls `openStationScreen` only when `tab.screen !== stationScreen`. Home goes through `backToHome`, chart through `openChart`, and saveLoad through `openSaveScreen`. The e2e tests "re-clicking the active tab is a no-op" and "overlay-to-overlay restores input context" pass in Docker. |
| 5 | `navigateStation` refuses when disposed, paused, context-lost, not docked or the overwrite dialog is open. | VERIFIED | Lines 1628-1636 check `disposed`, `contextLost`, `paused`, undefined state and `saveLoad?.isConfirming()`. `isTabEnabled` rejects a non-docked mode. The e2e test "navigation refused while paused and while overwrite dialog open" force-clicks a tab and passes. Without these guards `openStationScreen` would change the screen, so the test can tell the difference. See WR-01 for the Launch case. |
| 6 | The nav appears in #docked, #chart and the save screen with `aria-label="Station computer"`. The active tab has `aria-current="page"`. The chart nav is hidden when not docked, and hidden before first paint. | VERIFIED | `index.html:766-768, 873-875, 891-893` hold the three navs. `sync` sets or removes `aria-current` and sets `chartNav.element.hidden = mode !== "docked"`. `openChart` calls `syncStationNav()` after `chartOpen` is set and before `overlay.show` (`game-session.ts:1777`). The e2e test "in flight the chart opens without the station strip" passes. |
| 7 | Tabs have `tabindex=-1`, mousedown is swallowed, there is no `role=tablist`, and rows stay non-focusable. | VERIFIED | `makeButton` sets `tabIndex = -1`. A `mousedown` `preventDefault` is attached to every nav and sub-nav host. `rg tablist` finds only a doc comment. The e2e test "tab clicks never move keyboard focus and keep native Enter and paging unchanged" passes. See WR-02 for the residual script-focus case. |
| 8 | Sub-tabs exist only as Status\|Manifest and Short\|Long. They render as `aria-pressed` buttons and stay in sync with the keys. | VERIFIED | `STATUS_SUBTABS` and `CHART_SUBTABS` are the only sub-tab data. `setStationPage` and `setChartRange` exist, with `syncStationNav()` added to the keyboard `chartRange` case (:1951). The e2e sub-tabs test passes. |
| 9 | The footer hints are generated from the registry and fit on one line at 1280x720. | VERIFIED | `keyHints` (:822-841) uses `screenSwitchHints` and `primaryKeyLabel`. Market keeps its static text, as the plan allows. The e2e test "footer hints fit one line, disabled and selected states legible" passes in Docker with the measured height assertion. |
| 10 | All nine tabs sit on one row at 1280x720. Disabled text and borders use #2f8a47 or brighter. Selected and focus states differ. CSS is scoped by container id. | VERIFIED | `index.html:313-401`. Every rule is scoped by `#docked`, `#chart` or `#save-load`. Disabled colour is `#2f8a47` with `:disabled:hover` and `:focus-visible` resets. Selected is a bold, filled `#0a2a12` with a `#33ff66` underline. Focus-visible is a `#ffd966` outline. The e2e "nine tabs on one row" and contrast tests pass. |
| 11 | RESERVED_F_KEYS includes F1 and F4. The fast gate smoke test exists. `src/sim` is untouched. | VERIFIED | `actions.ts:290-299` lists F1 to F8. The `keyboard.ts` doc comments now say eight keys. `bindings.test.ts` and `station-actions.test.ts` pass. The smoke test is at `tests/e2e/docking.spec.ts:419` and passes. `test:e2e:fast` includes `docking.spec.ts`. `git diff 154f1ef HEAD --stat -- src/sim` is empty. |
| 12 | The PROJECT.md Key Decisions row and the README Controls row exist. | VERIFIED | `.planning/PROJECT.md:158` has the row, and the footer at :178 mentions the quick task. It states that the real browser help-page behaviour is untested. `README.md:78` has the F4 / 4 row. |

**Score:** 12/12. Nothing is behavior-unverified, so `behavior_unverified: 0`.

## Commands Run

| Check | Result |
|-------|--------|
| `docker compose run --rm test npx vitest run tests/ui/station-tabs.test.ts tests/ui/station-interfaces.test.ts tests/input tests/contract/readme.test.ts` | 5 files, 108 tests passed |
| `docker compose run --rm typecheck` | exit 0 |
| `docker compose run --rm lint` | exit 0 (eslint and prettier clean) |
| Playwright (Chromium), `station-tabs.spec.ts` | one-row layout, Launch from Home only, sub-tabs, footer hints: 4 of 4 passed |
| Playwright (Chromium), `station-tabs.spec.ts` and `docking.spec.ts` | tab strip smoke test, active no-op and underlying state, overlay-to-overlay restore, force-enabled Launch, pause and overwrite guards, focus and Enter, flight chart: 7 of 7 passed |
| `git diff 154f1ef HEAD --stat -- src/sim` | empty |

## Static versus Docker evidence

- **Static only:** tab order and the hidden slots, the F4 plumbing, the absence of `role=tablist` and `data-action`, the CSS selectors and colours, and the call sites of `syncStationNav`.
- **Docker-proven:** the unit matrix, the contract tests, typecheck and lint. The e2e proof covers one-row layout, single-line hints, overlay context restore, guards under force-click, focus behaviour, the flight chart and the fast-gate smoke test.
- **Not re-run by me:** the full verify-full suite and the Firefox e2e-cross suite. The executor reported verify-full green and I did not re-prove it.
- **Not provable by any test:** the real browser help-page behaviour for F1 and F4. Only the cancellation of a synthetic event is asserted. The plan and PROJECT.md record this as untested.

## Review warnings

Neither warning makes a must-have false.

- **WR-01 (advisory, not a gap).** The test "a force-enabled Launch tab never launches off Home" would pass even without the `isTabEnabled` check in `navigateStation`. The frame filter and the per-frame queue wipe under overlays catch the queued launch anyway. The guard is present, is wired, and is covered by the unit availability matrix. Only the independent sink-level proof is missing. Truth 3 therefore still holds on `isTabEnabled`, the sink check and the frame filter, none of which was removed. I suggest a follow-up to make the sink decision unit-testable.
- **WR-02 (advisory, not a gap).** `tabindex=-1` plus the mousedown swallow stops pointer-induced focus, which is what truth 7 claims. A script-focused strip button could still be activated by Enter or Space, because no host keydown guard exists. No must-have requires that guard, but a defence-in-depth `keydown` handler and a sub-tab mousedown test would close it.

## Other observations (not gaps)

- The Home menu tiles still list four screens and omit F4. This is by design (non-goal), but the Home footer hint already lists F4.
- The Home footer shows "1 launch" while the tab shows "F1 Launch" (IN-02). This is a cosmetic inconsistency and needs an owner decision.

## Anti-patterns

No TBD, FIXME or XXX markers appeared in the phase-modified source files that I read. All strings are written with `textContent`. I found no stubs.

## Human verification

None required. The plan acknowledges the real browser help-page behaviour as untested and records it in PROJECT.md. That is a known accepted limitation, not an open item.

---

_Verified: 2026-11-09_
_Verifier: Claude (gsd-verifier)_
