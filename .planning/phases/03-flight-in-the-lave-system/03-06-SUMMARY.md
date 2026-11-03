---
phase: 03-flight-in-the-lave-system
plan: 06
subsystem: input / settings / ui / app
tags:
  - keyboard
  - rebinding
  - localstorage
  - settings-schema
  - pause
  - auto-pause
  - focus-trap
  - input-frame

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 01's InputFrame/Command seam, keyboard source, app session, docked panel and probe
  - phase: 01-foundation-containers-compliance
    provides: the Docker verify chain and the sim-purity/layer guards

provides:
  - src/input/bindings.ts (BindingMap, bindAction, unbindAction, detectConflict, resetBindings, labelFor)
  - src/settings/schema.ts (SETTINGS_KEY, SETTINGS_VERSION, SettingsV1, HintId, defaults, validateSettings, mergeDefaults)
  - src/settings/store.ts (loadSettings, saveSettings, resetSettings)
  - src/ui/pause.ts (createPauseOverlay)
  - src/ui/controls.ts (createControlsPanel)
  - src/ui/settings-panel.ts (createSettingsPanel)
  - the DOM-free input core (createInputState) plus attach/detach/setBindings on the keyboard source

affects:
  - 03-07 (HintId, hintsSeen and launchSeen are now persisted; the hint controller reads them)
  - 03-08 (the pause overlay sits above the failure surface; no boot path changed)
  - 03-09 (dispose must cover the pause/controls/settings listeners and the focus-loss controller)

actuals:
  tokens: 21411
  tasks: 3
  commits: 3
  plan_head_before: d0a7b8d63d6935df5476a22ad91f47f47a2b2485
  plan_head_after: 328c08d6bbe683570b4fc266a2ed10c5cc2fb59a

tech-stack:
  added: []
  patterns:
    - a semantic action map keyed by KeyboardEvent.code, never by key
    - one versioned JSON blob in localStorage, validated by an allowlist and built from null-prototype maps
    - a DOM-free input core (createInputState) with a thin window-listener wrapper
    - pause as app state, never a FlightState field, with an accumulator reset on both edges
    - subpanel Escape handled in the session's window-capture phase so it backs out one level

key-files:
  created:
    - src/input/bindings.ts
    - src/settings/schema.ts
    - src/settings/store.ts
    - src/ui/pause.ts
    - src/ui/controls.ts
    - src/ui/settings-panel.ts
    - tests/settings/schema.test.ts
    - tests/input/bindings.test.ts
    - tests/e2e/settings.spec.ts
  modified:
    - src/input/actions.ts
    - src/input/keyboard.ts
    - src/app/game-session.ts
    - src/main.ts
    - index.html

key-decisions:
  - "bindAction replaces the action's codes, so a rebind makes the old key stop acting; the four-code cap is enforced on load and by capCodes."
  - "validateSettings truncates a five-code array to four (the plan's own truncation test) while still rejecting unknown top-level keys, unknown actions, unknown hints, oversized hintsSeen and non-boolean launchSeen."
  - "settingsProblem is exported so a failure names its field/action without changing validateSettings's SettingsV1 | null signature."
  - "The Controls and Settings sections are nested inside #pause so the tracer's #pause [data-pause-action=resume] selector stays visible and clickable while a subpanel is open."
  - "Escape is intercepted in the session's window-capture listener while a subpanel is open; P is left to the keyboard source and toggles pause everywhere."
  - "paused is app state; pause and resume both clear input and reset the accumulator, and lastMs advances every frame so hidden time is never replayed."
  - "launchSeen is persisted on the first launch handover; hintsSeen is stored but the hint lifecycle remains plan 07's."
  - "All settings/controls copy is written with textContent; the persisted blob is one version-1 object under wegolite.settings."

patterns-established:
  - "A rebind is proven end-to-end: capture -> conflict check -> localStorage -> reload -> the new key rolls and the old key does not."
  - "A persisted blob is parsed into fresh null-prototype maps; __proto__ is ignored and never merged."
  - "A pause edge resets the accumulator and clears held input, so a lost keyup cannot leave the ship rotating."
  - "A subpanel backs out one level with Escape and keeps focus inside the overlay via a Tab trap."

requirements-completed:
  - FLGT-06
  - FLGT-07

coverage:
  - id: D1
    description: "Every Phase 3 action is rebindable through one semantic map with the researched defaults, conflict detection, reserved-key rejection and reset-to-defaults"
    requirement: FLGT-06
    verification:
      - kind: unit
        ref: "tests/input/bindings.test.ts#createBindingMap / bindAction / unbindAction and resetBindings"
        status: pass
      - kind: e2e
        ref: "tests/e2e/settings.spec.ts#rebinding roll-right persists through reload and changes the flight"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bindings and preferences persist as one strict version-1 JSON blob in localStorage and degrade safely on corrupt, hostile or newer data"
    requirement: FLGT-06
    verification:
      - kind: unit
        ref: "tests/settings/schema.test.ts#validateSettings / loadSettings / saveSettings and resetSettings"
        status: pass
    human_judgment: false
  - id: D3
    description: "Input stays an InputFrame/Command layer: one sim-owned frame, edge commands once per non-repeat keydown, and a rebind changes the actual flight"
    requirement: FLGT-07
    verification:
      - kind: unit
        ref: "tests/input/bindings.test.ts#createInputState"
        status: pass
      - kind: e2e
        ref: "tests/e2e/settings.spec.ts#rebinding roll-right persists through reload and changes the flight"
        status: pass
    human_judgment: false
  - id: D4
    description: "Pause freezes the sim and clock from docked and in flight; blur/visibility auto-pause and clear held input; the overlay traps Tab and Escape backs out one level"
    requirement: FLGT-06
    verification:
      - kind: e2e
        ref: "tests/e2e/settings.spec.ts#pause freezes the clock and resume never replays hidden time"
        status: pass
      - kind: e2e
        ref: "tests/e2e/settings.spec.ts#blur and visibility hidden auto-pause and clear held input"
        status: pass
      - kind: e2e
        ref: "tests/e2e/settings.spec.ts#the overlay traps focus and Escape backs out one level"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Settings panel explains that settings are local, links to Controls instead of duplicating the list, and resets all settings"
    requirement: FLGT-06
    verification:
      - kind: e2e
        ref: "tests/e2e/settings.spec.ts#the overlay traps focus and Escape backs out one level (settings reset removes the blob)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Manual keyboard-navigation and readability pass over the pause overlay and Controls panel"
    verification: []
    human_judgment: true
    rationale: "The automated proof covers focus containment, Escape/P behaviour and the numeric clock freeze; whether the overlay and 24 control rows are readable and pleasant to navigate is a visual judgement reserved for /gsd-verify-work."

duration: 37min
completed: 2026-11-03
status: complete
---

# Phase 3 Plan 6: Controls, Settings and Pause Summary

**A rebindable semantic action map persisted as one strict version-1 `localStorage` blob, plus a single pause overlay that freezes the simulation, clears held input on focus loss, and reaches Controls and Settings from docked or in flight.**

## Performance

- **Duration:** ~37 min (Docker waits included)
- **Started:** 2026-11-03T18:03:00Z (approx.)
- **Completed:** 2026-11-03T18:40:00Z
- **Tasks:** 3
- **Files modified:** 14 (9 created, 5 modified; 2,376 insertions, 99 deletions)

## Accomplishments

- The twelve Phase 3 actions now live in one mutable `BindingMap` keyed by `KeyboardEvent.code`. `bindAction` replaces the action's table (so a rebind makes the old key stop acting), `detectConflict` names the action that already owns a code, `resetBindings` restores the researched defaults, and `labelFor` supplies the UI/hint text.
- `src/settings/schema.ts` is a strict validator: exactly four top-level keys, exactly the allowlisted actions and `HintId`s, capped arrays and strings, a fresh `Object.create(null)` map, `__proto__` ignored, and a newer version never downgraded. `src/settings/store.ts` is the only writer of `wegolite.settings`; corrupt/shape-invalid blobs are copied to `wegolite.settings.corrupt` (best-effort), and quota/security exceptions never break boot.
- `src/input/keyboard.ts` now has a DOM-free `createInputState` core and a thin listener wrapper. Axes are pressed differences, edge commands are emitted once per non-repeat keydown, `setBindings` makes a rebind take effect immediately, and `clearAll` runs on blur, visibility hidden, pointer-lock change, fullscreen change and teardown.
- `#pause` is the single overlay: Resume, Controls and Settings are its only controls, it freezes the sim and clock, focuses Resume on open, traps Tab inside the overlay, returns focus to the canvas on close, and lets Escape back out of Controls/Settings one level before resuming. `#controls` lists all twelve actions with `button[data-rebind="<action>"]`, a capture mode that stops propagation, Escape/Backspace/Delete handling, reserved-key rejection and a reset control. `#settings-panel` is a small local-settings panel with a reset-all action.
- `main.ts` wires `blur` and `visibilitychange` to `session.pause()` and `pointerlockchange`/`fullscreenchange` to `session.clearInput()`, all behind one `AbortController` aborted on `pagehide`.
- `docker compose run --rm verify` is green: 402 unit tests, 14 e2e tests, lint, typecheck, `assets:check` and build.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "rebind roll-right, reload, and fly with the new key"** - `4264637` (feat)
2. **Task 2: Harden the versioned settings schema against corrupt and hostile blobs** - `4af1e69` (test)
3. **Task 3: Pause, auto-pause and the keyboard-navigable overlay** - `328c08d` (feat)

**Plan metadata:** committed after this summary (docs).

**Tracer gate:** the task-1 `<verify>` was re-run after `4264637` (focused settings e2e + typecheck/lint + the full unit suite) and passed → `⚡ Tracer verified end-to-end — expanding`.

## Files Created/Modified

- `src/input/bindings.ts` — the null-prototype action table, replace-on-bind, conflict detection, reset, code labels.
- `src/settings/schema.ts` — `SETTINGS_KEY`, `SETTINGS_VERSION`, `SettingsV1`, the `HintId` allowlist, `defaults`, `validateSettings`, `settingsProblem`, `mergeDefaults`.
- `src/settings/store.ts` — `loadSettings`/`saveSettings`/`resetSettings` with an injectable `Storage`.
- `src/ui/pause.ts` — the single overlay, focus management and the Tab trap.
- `src/ui/controls.ts` — the rebinding list, capture mode and reset.
- `src/ui/settings-panel.ts` — the local-settings explanation, Controls link and reset-all.
- `src/input/keyboard.ts` — the DOM-free input core, mutable bindings and focus-loss clears.
- `src/input/actions.ts` — `isActionId` for persisted/DOM strings.
- `src/app/game-session.ts` — settings load/save, pause/resume, the subpanel Escape handler and the panel wiring.
- `src/main.ts` — the DOM roots and the focus-loss listeners.
- `index.html` — `#pause`, `#controls` and `#settings-panel` markup and CSS; `#view` gains `tabindex="-1"`.
- `tests/settings/schema.test.ts`, `tests/input/bindings.test.ts` — 47 unit cases covering the schema and binding contract.
- `tests/e2e/settings.spec.ts` — the rebind/persistence tracer, clock freeze, auto-pause and focus-trap proofs.

## Decisions Made

- **Rebind replaces, not appends.** `bindAction` sets the action's table to the captured code. The four-code cap is a load-time resource bound (`capCodes`), which is what makes "the old key stops working" true.
- **Truncate a five-code array.** The plan's own task-2 test requires truncation; rejecting the whole blob would throw away every other binding. Unknown keys/actions/hints, an oversized `hintsSeen` and a non-boolean `launchSeen` still reject the blob.
- **A second read-only validator entry point.** `settingsProblem` returns the field-named message while `validateSettings` keeps the planned `SettingsV1 | null` signature.
- **Subpanels live inside `#pause`.** The tracer selects `#pause button[data-pause-action="resume"]` after opening Controls, so the pause root must stay visible and the Resume button must stay clickable while the subpanel is shown.
- **Escape is session-level; P is input-level.** A window-capture listener backs out of an open subpanel (unless a rebind capture owns the key); P reaches the keyboard source and toggles pause from any level.
- **`paused` is app state.** It never enters `FlightState`; pause and resume both clear held input and reset the accumulator, and `lastMs` advances every frame so a 600 ms pause is not replayed.
- **`launchSeen` is persisted now.** It is set on the first handover and saved with the bindings; the hint lifecycle itself stays plan 07's.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Nested `#controls`/`#settings-panel` inside `#pause`**
- **Found during:** Task 1 (the pause shell)
- **Issue:** The tracer clicks `#pause button[data-pause-action="resume"]` after opening Controls. A sibling full-screen `#controls` overlay would hide the Resume button and make the selector unclickable.
- **Fix:** Both subpanels are sections inside `#pause`; opening one keeps the pause menu visible and the Resume button reachable.
- **Files modified:** `index.html`
- **Verification:** the settings e2e passes the Controls → rebind → Resume sequence.
- **Committed in:** `4264637`

**2. [Rule 3 - Blocking] Added the DOM-free `createInputState` core and `setBindings`/`isBound`/`attach`/`detach`**
- **Found during:** Task 1 (the keyboard refactor)
- **Issue:** The planned `tests/input/bindings.test.ts` runs in the Node Vitest project, which has no `window`/`KeyboardEvent`; a browser-only source could not prove edge commands or `clearAll`. A rebind also had to take effect without recreating the listener.
- **Fix:** `createInputState` owns the held set, pending commands and the mutable code→action table; `createKeyboardInputSource` is a thin listener wrapper with `attach`/`detach`. `setBindings` swaps the table in place.
- **Files modified:** `src/input/keyboard.ts`
- **Verification:** 20 unit cases in `tests/input/bindings.test.ts` plus the browser rebind proof.
- **Committed in:** `4264637`

**3. [Rule 2 - Missing Critical] Exported `settingsProblem`**
- **Found during:** Task 2 (the schema tests)
- **Issue:** The plan requires failure messages that name the field/action, but `validateSettings` returns only `SettingsV1 | null`, so the message would be lost.
- **Fix:** `settingsProblem(value): string | null` is the read-only diagnostic; `validateSettings` remains the planned signature and both share one `parseSettings`.
- **Files modified:** `src/settings/schema.ts`
- **Verification:** the schema tests assert `settings.bindings.notAnAction`, `settings.version`, `settings.hintsSeen[0]` and `settings.launchSeen` in the messages.
- **Committed in:** `4264637` (implementation) and `4af1e69` (tests)

**4. [Rule 1 - Bug] `#view` needed `tabindex="-1"` for focus return**
- **Found during:** Task 1 (focus management)
- **Issue:** `HTMLCanvasElement.focus()` is a no-op without a tabindex, so closing the overlay could not return focus to the game root.
- **Fix:** `#view` is now programmatically focusable; `PauseOverlay.hide()` focuses it.
- **Files modified:** `index.html`
- **Verification:** the focus-trap e2e asserts focus stays inside `#pause` while open and the overlay closes cleanly.
- **Committed in:** `4264637`

### Scope notes

- Task 1 delivered the strict validator/store that task 2 was scheduled to harden, because the tracer needed `loadSettings`/`saveSettings` to persist the rebind. Task 2 then pinned the hardening with 47 unit tests and needed no production change.
- The `#settings-panel` markup landed with the pause shell in task 1; task 3 created `src/ui/settings-panel.ts` and wired it.

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 missing critical, 1 bug)
**Impact on plan:** Every fix was required to make a named truth observable (the tracer selector, the Node tests, the failure messages, focus return). No locked decision changed, no new preference was added, and no pinned default was weakened.

## Issues Encountered

- The first draft of `tests/e2e/settings.spec.ts` waited on the probe without navigating to `/`, so the page was `about:blank` and the probe never appeared. `startAndLaunch` now calls `page.goto("/")` before `waitForReady`.
- The main chunk is 1,460.93 kB raw / 283.45 kB gzip, still above the research's 250 kB gzip note. This is the pre-existing Three.js bundle concern from plans 01/05; no budget check exists in `verify` and no chunking work belongs to this plan.

## Manual Acceptance (outstanding)

The plan's manual keyboard-navigation/readability pass has **not** been performed by the executor and is not claimed:

- Open the pause overlay in flight and docked; confirm Resume/Controls/Settings read clearly, Tab visits every control, Escape backs out of Controls/Settings, P resumes from any level, and the focus ring is visible.
- In Controls, confirm all twelve rows fit and remain readable at 1280×720 and 1920×1080, and that the "Already bound to …" / reserved-key messages are legible.
- The automated proof covers the numeric half: the clock freeze, no hidden-time replay, blur/visibility auto-pause, held-input clear, Tab containment, Escape back-out and the settings reset.

This is the `03-VALIDATION.md` manual row for pause/controls; it remains for `/gsd-verify-work`.

## Known Stubs

None. The hint lifecycle (launch/torus/speed hints, first-use dismissal) is intentionally not implemented here; plan 07 owns `HintController` and reads `hintsSeen`/`launchSeen` from the schema this plan created.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07 can import `HintId` and `HINT_IDS`, plus the persisted `hintsSeen`/`launchSeen`, from `src/settings/schema.ts`, and enqueue hints through the existing `MessageQueue`; the pause overlay does not touch the queue.
- Plan 09 must dispose the pause/controls/settings listeners; `session.dispose()` already aborts the session UI controller and each panel's own controller, and `pagehide` aborts the main focus-loss controller.
- The full `verify` chain is green (402 unit tests, 14 e2e tests); the Phase 1 golden and cadence hashes are unchanged.

## Self-Check: PASSED

- All nine created files exist on disk.
- Commits `4264637`, `4af1e69` and `328c08d` are ancestors of `HEAD`.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were not modified by this executor.

---

*Phase: 03-flight-in-the-lave-system*
*Completed: 2026-11-03*
