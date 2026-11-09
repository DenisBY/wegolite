---
phase: 261109-h8t-add-a-clickable-f-key-ordered-tab-strip
reviewed: 2026-11-09T00:00:00Z
depth: quick
files_reviewed: 17
files_reviewed_list:
  - README.md
  - index.html
  - src/app/game-session.ts
  - src/app/probe.ts
  - src/input/actions.ts
  - src/input/keyboard.ts
  - src/ui/station-model.ts
  - src/ui/station-nav.ts
  - src/ui/station-tabs.ts
  - src/ui/station.ts
  - tests/e2e/docking.spec.ts
  - tests/e2e/station-tabs.spec.ts
  - tests/e2e/station.spec.ts
  - tests/input/bindings.test.ts
  - tests/input/station-actions.test.ts
  - tests/ui/station-interfaces.test.ts
  - tests/ui/station-tabs.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Quick Task 261109-h8t: Code Review Report

**Reviewed:** 2026-11-09
**Depth:** quick (requested scope was the diff `154f1ef..HEAD`; the diff was read in full and the surrounding session code was traced where needed)
**Files Reviewed:** 17
**Status:** issues_found

## Summary

I found no correctness or security defects in the production code. I traced these areas and they hold up:

- **`navigateStation` guards:** `disposed`, `contextLost`, `paused`, undefined `state` and `saveLoad.isConfirming()` are all checked. Overlay close and input-context restore are correct for every overlay-to-overlay and overlay-to-screen pair. `closeChart` and `closeSaveScreen` restore the recorded context before `openStationScreen`, `backToHome`, `openChart` or `openSaveScreen` run.
- **Listener lifecycle:** one `AbortController` covers the delegated listeners. They sit on static host elements, so there is no per-sync re-registration. `dispose()` is wired into the session disposer.
- **`ACTION_CONTEXTS` and `STATION_SCREEN_ACTIONS`:** both are complete for F4. `ACTION_IDS`, `DEFAULT_BINDINGS`, `ACTION_LABELS`, the `StationScreen` union, the probe union and the `openStationScreen` switch were all updated. `createBindingMap` and the settings schema (`isActionId`) cope with an old settings file that lacks `stationInterfaces`.
- **Mutation order:** `stepFlight` mutates `state` in place before `handleEvent` runs, so `syncStationNav` sees the new mode at the `launched` and `docked` events.
- **Chart nav in flight:** `[hidden] { display: none !important }` overrides `.station-nav { display: flex }`. `openChart` syncs before `overlay.show`, so there is no flash.
- **Other checks:** all strings are written with `textContent`, so there is no injection surface. The CSS cascade order for the disabled, selected and hover states is correct.

Both warnings concern the evidence rather than the code: one test proves less than its title claims, and one input-layer property (T-05-25) depends on an invariant with no defence in depth and no test for the sub-tabs.

## Warnings

### WR-01: "a force-enabled Launch tab never launches off Home" passes with or without the sink guard

**File:** `tests/e2e/station-tabs.spec.ts:354-391` (guard under test: `src/app/game-session.ts:1642-1646` and `:196`)
**Issue:** The test is meant to prove that `navigateStation` refuses `launch` off Home even when the DOM `disabled` attribute is bypassed. None of its three cases can fail if the `isTabEnabled` check is removed:

- **Market case:** the queued `{ kind: "launch" }` is dropped by the frame filter at `game-session.ts:2675-2678` (`stationScreen === "home"` is required).
- **Chart-over-Home and save-screen-over-Home cases:** `frame()` wipes the queue on every frame while an overlay is open (`game-session.ts:2632-2650`: `pending.length = 0` under `if (chartOpen)` and `if (saveScreenOpen)`). A launch queued by a forced click never reaches the drain.

So the assertions (`mode === "docked"`, overlay still open) hold whether or not the sink guard exists. This matches the executor's report. The sink guard is defence in depth that no test pins. A later refactor that moves or drops it, and also loosens the frame filter, would ship green.
**Fix:** Make the guard decision unit-testable and assert it directly. Either option works:

```ts
// station-tabs.ts: pure, DOM-free
export function navigationAllowed(id: string, nav: StationNavState, flags: {
  contextLost: boolean; confirming: boolean; disposed: boolean;
}): boolean { /* the checks currently inlined in navigateStation */ }
```

`navigateStation` would call it, and `tests/ui/station-tabs.test.ts` would assert the full matrix (launch on a section, on chart-over-home and on save-over-home, plus paused and confirming).

Alternatively, expose `pending.length` (or a launch-command counter) through the `?test=1` probe and assert it stays 0 right after `forceClick`, before the next frame can drain it. Read it inside the same `page.evaluate` as the click.

Also rename or document the Market case so it does not claim to test the sink.

### WR-02: Enter/Space protection for the strip (T-05-25) rests on "never focused", with no defence in depth and no test on sub-tabs or script focus

**File:** `src/ui/station-nav.ts:610-615, 681-686`, `tests/e2e/station-tabs.spec.ts:444-493`
**Issue:** The buttons are `tabindex="-1"` and the hosts cancel `mousedown`. That keeps pointer clicks from focusing a button, but a `tabindex="-1"` button is still focusable by script, by an assistive-technology virtual cursor, or by any future code path that calls `focus()`. Once focused, a native Enter or Space press dispatches `click`, which reaches `navigateStation` and bypasses the semantic action layer. The window-level `keydown` handler only cancels that default when the key is bound in the current context. Enter and Space are not bound in `dockHome` (the test itself presses Enter on Home and expects nothing to happen).

The test titled "keep native Enter and paging unchanged" never focuses a strip button. It presses Enter with focus on the body or section, so it passes whether or not the strip is safe. The only real proof is the `mousedown` `defaultPrevented` check, and that covers one tab button only. The sub-tab buttons (`data-station-subtab`) are never checked for `mousedown`, and no test covers a script-focused button.
**Fix:** Add a cheap second layer on the same hosts, and test it:

```ts
for (const { element } of [...navs, ...subnavs]) {
  element.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" || event.key === " ") event.preventDefault();
    },
    { signal },
  );
}
```

Then add an e2e case: focus a tab and a sub-tab via `evaluate(el => el.focus())`, press Enter and Space, and assert the screen and mode are unchanged. Extend the mousedown cancellation check to a sub-tab button too.

## Info

### IN-01: Redundant guards that duplicate each other (maintenance noise)

**File:** `src/app/game-session.ts:184-196`, `src/ui/station-tabs.ts:945-958`
**Issue:**

- `navigateStation` tests `paused` explicitly and then `isTabEnabled`. `isTabEnabled` already returns false for `nav.paused` and `nav.mode !== "docked"`, so the explicit checks overlap. This is also why the paused e2e case cannot tell which guard is active.
- In `isTabEnabled`, `ACTION_CONTEXTS.launch.includes(base)` is implied by `base === "dockHome"` for the current table. It would only matter if the launch context list changed, and then the surrounding `base === "dockHome"` would still force the answer.
- `station-nav.ts:742` writes `bindings[tab.action] ?? []`, while `tabKeyLabel` and `primaryKeyLabel` index the same `Record` with no fallback. The two code paths disagree about whether a missing key is possible.

**Fix:** Keep one place per invariant (preferably the pure `isTabEnabled`, which is unit-tested) and let `navigateStation` only add the guards the pure function cannot see (`disposed`, `contextLost`, `isConfirming`). Pick one convention for the `?? []` fallback.

### IN-02: Two different key-label policies on the same screen ("1 launch" in the footer, "F1 Launch" on the tab)

**File:** `src/app/game-session.ts:92-95`, `src/ui/station-tabs.ts:980-997`
**Issue:** The Home footer hint uses `primaryKeyLabel(map, "launch")`, which takes the first bound code and renders `1 launch` from `["Digit1", "F1"]`. The tab uses `tabKeyLabel`, which prefers an F-key and renders `F1 Launch`. Both are valid keys, but showing two spellings for one action on one screen reads as a mismatch, and the registry was meant to be the single source of key text.
**Fix:** Use `tabKeyLabel` for the Launch hint too, or document the intended difference. This is a decision for the owner.

### IN-03: Home menu tiles omit the new F4 Interfaces screen, and the test names still say "four"

**File:** `index.html` (`.station-menu`, around line 777-782), `tests/e2e/docking.spec.ts:371`
**Issue:** The Home screen lists four screens by hard-coded text (`Market (F8)`, `Outfitting (F3)`, `Status (F5)`, `System data (F7)`). There are now five sections, and the Home footer hint (registry-generated) lists F4 while the tiles above it do not. CONTEXT.md says to keep these strings unless intentionally updated, so this is an owner call, not a defect. The static `(F8)` strings also will not follow a rebind, unlike the generated strip and hints.
**Fix:** Either add an `Interfaces (F4)` tile (and update "four screen entries" in the test titles) or record the omission in the decision log. Longer term, hydrate the tiles from the registry.

### IN-04: Sub-tab buttons have no disabled state and the hydrator has no unit test

**File:** `src/ui/station-nav.ts:659-679, 749-772`
**Issue:**

- The Status and Manifest buttons and the Short and Long buttons never receive `disabled`, so they look actionable while paused or covered. The handlers (`setStationPage`, `setChartRange`) guard correctly, so a click is a silent no-op.
- `createStationNav.sync`, which holds the cache key, `aria-current` removal, `aria-pressed` and the chart-nav `hidden` rule, is covered only by browser tests. A DOM unit test (if the Vitest environment allows one) would cover stale `aria-current` and `aria-pressed` regressions cheaply, such as a `sync` with unchanged state, a changed binding, or an unchanged key after a forced attribute change.

**Fix:** Optional. Mirror `disabled` onto sub-tabs from the same `StationNavState`, and add a hydrator unit test that checks that exactly one tab carries `aria-current` after each `sync`.

---

_Reviewed: 2026-11-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
