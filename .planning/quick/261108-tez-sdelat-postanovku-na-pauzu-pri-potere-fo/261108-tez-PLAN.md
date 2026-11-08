---
phase: quick-261108-tez
plan: 261108-tez
type: execute
wave: 1
depends_on: []
files_modified:
  - src/settings/schema.ts
  - src/settings/store.ts
  - tests/settings/schema.test.ts
  - index.html
  - src/ui/settings-panel.ts
  - src/app/game-session.ts
  - src/main.ts
  - tests/e2e/settings.spec.ts
autonomous: true
requirements: []
gap_closure: false
estimate:
  tokens: 30000
  raw_tokens: 30000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "With the new setting on, window blur and a hidden tab pause the game and show the pause overlay exactly as before. On is the default for new installs and for every saved blob that predates the field."
    - "With the setting off, window blur and a hidden tab do not open the pause overlay, the simulation clock keeps advancing, and held keys are still cleared."
    - "The Settings panel, reached from the pause overlay, shows a checkbox that reflects the stored value when the panel opens and saves each change to the wegolite.settings blob at once."
    - "Reset all settings restores the checkbox and the stored value to on."
    - "The stored blob keeps schema version 1. A non-boolean pauseOnFocusLoss value fails the strict validator and is handled like any other corrupt field: the original is backed up and defaults are used."
  artifacts:
    - "src/settings/schema.ts"
    - "src/settings/store.ts"
    - "tests/settings/schema.test.ts"
    - "index.html"
    - "src/ui/settings-panel.ts"
    - "src/app/game-session.ts"
    - "src/main.ts"
    - "tests/e2e/settings.spec.ts"
  key_links:
    - "src/main.ts focus listeners call GameSession.focusLost(), which reads the session's loaded settings.pauseOnFocusLoss and either calls pause() or only clears held input."
    - "The index.html checkbox [data-settings-toggle=pauseOnFocusLoss] calls onPauseOnFocusLossChange in settings-panel.ts, then game-session persistSettings() and saveSettings() write the key to localStorage wegolite.settings."
    - "The key name pauseOnFocusLoss must match in the schema allowlist, parseSettings, defaults, mergeDefaults, and the saveSettings blob. A mismatch either drops the value on save or rejects the blob on load."
---

<objective>
Make the D-15 auto-pause on focus loss (window blur and a hidden tab) a player-controlled toggle in Settings. The default stays ON, so current behaviour is unchanged unless the player switches it off.

Purpose: some players alt-tab to read a guide or a second window and do not want the game to stop. The toggle gives them that choice. The default keeps D-15 for everyone else.

Output: an optional boolean in the versioned settings blob (schema version 1, absent means on), a checkbox in the Settings panel, a session method that gates only the pause step, and tests at unit and browser level.
</objective>

<non_goals>
- Clearing held input on blur or hidden tab stays unconditional. `src/input/keyboard.ts` already clears on hidden and is not touched.
- No change to pointer-lock or fullscreen clearing, to the P and Escape pause toggle, or to the WebGL context-loss pause (QUAL-05).
- `SETTINGS_VERSION` stays 1. No migration, no version bump, no change to the newer-version guard.
- No new dependency. No edit to ROADMAP.md, STATE.md, or REQUIREMENTS.md.
- The toggle is the only new preference. Controls rebinding and hint state are unchanged.
</non_goals>

<interfaces>
Facts verified while planning (symbol names are authoritative; approximate line numbers may drift):

- `src/settings/schema.ts`: `SettingsV1` interface (about line 50) holds `version`, `bindings`, `hintsSeen`, `launchSeen`. `parseSettings` has an allowlist set of top-level keys (about line 75), strict per-field checks, and a return literal (about line 154). `defaults()` (about line 182) and `mergeDefaults()` (about line 195) each build a full object. `validateSettings` and `settingsProblem` wrap `parseSettings`.
- `src/settings/store.ts`: `loadSettings` runs `validateSettings` and on failure backs up the raw blob to `wegolite.settings.corrupt` and returns defaults. `saveSettings` (about line 80) writes an explicit object with four keys. It is the only writer of `wegolite.settings`.
- `src/app/game-session.ts`: `GameSession` interface (about line 275) with `pause()` and `clearInput()`. The session-level `let settings: SettingsV1 | undefined` is loaded around line 2759 as `{ ...loaded, bindings }`. `pause()` is about line 1408. `openSettings()` is about line 1473. `resetAllSettings()` is about line 1994. `persistSettings()` is about line 452. `createSettingsPanel({...})` is about line 2816. The returned session object is about line 2972 and already has `clearInput`.
- `src/main.ts`: the D-15 block (about lines 353-374) has a window `blur` listener and a document `visibilitychange` listener, and both call the session's unconditional pause. Pointer-lock and fullscreen listeners follow in the same block.
- `index.html`: `section#settings-panel` (about lines 836-853) has a heading, a paragraph, a paragraph with the Controls button, and `div.panel-actions` with Reset and Back.
- `src/ui/settings-panel.ts`: `createSettingsPanel` takes `root`, `onBack`, `onControls`, `onReset`. It finds buttons with `requireButton` and uses one `AbortController` for listeners.
- `src/app/game-loop.ts`: `advance()` clamps the frame delta to `MAX_FRAME_DELTA`, so running on after a stalled hidden tab does not replay the hidden time. No loop reset is needed when the game does not pause.
- No test double implements `GameSession`, so adding a method to the interface breaks no mock.
- `tests/settings/schema.test.ts`: the `validBlob()` fixture (about line 66) has no `pauseOnFocusLoss` key and must stay that way, because it pins backward compatibility. The saveSettings test asserts the exact sorted key list (about line 303). A typed `mergeDefaults({...})` literal (about lines 216-220) needs the new key to typecheck.
- `tests/e2e/settings.spec.ts`: the `StoredSettings` interface (about line 17) and the `storedSettings(page)` helper are already present. The existing test "blur and visibility hidden auto-pause and clear held input" covers the default-on path and must stay unchanged. `tests/e2e/throttle.spec.ts` asserts that a hidden tab pauses, which is the default-on path too.
- Compose services used by the commands: `test`, `e2e`, `lint`, `typecheck`, `verify` (in `compose.yaml`).
</interfaces>

<context>
@AGENTS.md
@src/settings/schema.ts
@src/settings/store.ts
@src/ui/settings-panel.ts
@src/app/game-session.ts
@src/main.ts
@index.html
@tests/settings/schema.test.ts
@tests/e2e/settings.spec.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add the optional pauseOnFocusLoss field to the settings schema and store</name>
  <files>src/settings/schema.ts, src/settings/store.ts, tests/settings/schema.test.ts</files>
  <read_first>src/settings/schema.ts, src/settings/store.ts, tests/settings/schema.test.ts</read_first>
  <action>
Adds the stored preference behind D-15. The default stays on, per the quick request.

1. In `src/settings/schema.ts`, add `pauseOnFocusLoss: boolean;` to the `SettingsV1` interface after `launchSeen`. Add the string "pauseOnFocusLoss" to the allowlist set of top-level keys inside `parseSettings`. Update the module header comment, which says the validator accepts exactly four top-level keys, so that it says five.

2. Inside `parseSettings`, read the raw value of `pauseOnFocusLoss` before building the return value. When the raw value is `undefined`, the blob predates this field, so the resolved value is `true`. Otherwise the raw value must be a boolean. Any other type, including `null`, fails with the message "settings.pauseOnFocusLoss: expected a boolean". Test for `undefined` with a strict `=== undefined` check, not with `??`, so that a stored `null` is rejected the same way `launchSeen` rejects one. Include the resolved value in the returned settings object.

3. `defaults()` sets `pauseOnFocusLoss: true`. `mergeDefaults()` copies `settings.pauseOnFocusLoss` into the rebuilt object.

4. In `src/settings/store.ts`, `saveSettings` adds `pauseOnFocusLoss: normalized.pauseOnFocusLoss` to the written blob. Leave `SETTINGS_VERSION` at 1. The field is optional on read, so existing blobs need no migration, and the newer-version guard in `loadSettings` is unchanged.

5. In `tests/settings/schema.test.ts`:
   - Add `pauseOnFocusLoss: true,` to the typed `mergeDefaults({...})` literal, so `SettingsV1` typechecks.
   - Change the exact sorted-keys assertion in the saveSettings test to five keys: bindings, hintsSeen, launchSeen, pauseOnFocusLoss, version.
   - Keep the `validBlob()` fixture unchanged. It has no such key and pins backward compatibility.
   - Add tests: `defaults()` has `pauseOnFocusLoss` true; `validBlob()` validates and gives `pauseOnFocusLoss` true; `pauseOnFocusLoss: false` survives `validateSettings`, `mergeDefaults`, `saveSettings`, and `loadSettings` on the existing FakeStorage; a string value and a `null` value are each rejected, and `settingsProblem` contains "settings.pauseOnFocusLoss".

Keep every other validation rule unchanged.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/settings/schema.test.ts</automated>
  </verify>
  <done>The schema test file passes in Docker. The saveSettings test asserts five keys. A blob without the key loads with the toggle on. A non-boolean value is rejected with a message that names settings.pauseOnFocusLoss. Round-tripping false through save and load keeps false.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the toggle through the Settings panel, the session, and the focus listeners</name>
  <files>index.html, src/ui/settings-panel.ts, src/app/game-session.ts, src/main.ts</files>
  <read_first>index.html, src/ui/settings-panel.ts, src/app/game-session.ts (GameSession interface, pause, openSettings, resetAllSettings, createSettingsPanel call, returned object), src/main.ts (D-15 block)</read_first>
  <action>
Connects the stored preference to the UI and to the focus listeners. Implements D-15 with the default preserved.

1. `index.html`: inside `section#settings-panel`, after the paragraph that links to Controls and before `div.panel-actions`, add a paragraph holding a `label` that wraps a checkbox `input` with the attribute `data-settings-toggle="pauseOnFocusLoss"`. The English label text is "Pause when the window or tab loses focus". Do not add a `checked` attribute. The session sets the state every time the panel opens.

2. `src/ui/settings-panel.ts`:
   - Add `readonly onPauseOnFocusLossChange: (enabled: boolean) => void;` to `SettingsPanelOptions`.
   - Add `setPauseOnFocusLoss(enabled: boolean): void;` to the `SettingsPanel` interface.
   - Resolve the checkbox with a helper modelled on `requireButton`. It selects `input[type="checkbox"][data-settings-toggle="pauseOnFocusLoss"]` and throws the same style of error when the element is missing.
   - Register its `change` event on the existing AbortController signal, and forward the checked state to `onPauseOnFocusLossChange`.
   - `setPauseOnFocusLoss` sets the checkbox `checked` property.
   - Replace the header comment's statement that no unrequested preference is added. The panel now holds the one requested toggle, and the comment should say so.

3. `src/app/game-session.ts`:
   a. In the `GameSession` interface, after `clearInput`, declare `focusLost(): void;` with a short comment. Focus was lost (D-15). Held input is always cleared. The game pauses only when the pause-on-focus-loss setting is on, which is the default.
   b. Next to the existing `pause` function, add a `focusLost` function. When `settings` is `undefined` or `settings.pauseOnFocusLoss` is true, call `pause()`. Otherwise clear held input through `input?.clearAll()` and do nothing else. The simulation keeps running on purpose. The frame-delta clamp in `game-loop` bounds the catch-up after a stalled hidden tab, so no loop reset is needed.
   c. Add a small helper that pushes the stored value into the panel with `settingsPanel?.setPauseOnFocusLoss(settings?.pauseOnFocusLoss ?? true)`. Call it at the start of `openSettings`, before the panel is shown. Call it at the end of `resetAllSettings`, so that Reset all settings returns the checkbox to on.
   d. In the `createSettingsPanel` options, add `onPauseOnFocusLossChange`. When `settings` is defined, set `settings.pauseOnFocusLoss` to the new value, then call `persistSettings()`.
   e. In the object returned by `createGameSession`, add `focusLost` next to `clearInput`.

4. `src/main.ts`: in the D-15 block, the two unconditional pause calls, one in the window `blur` listener and one in the document `visibilitychange` listener, become calls to `session.focusLost()`. Keep the `visibilityState === "hidden"` check. Rewrite the comment above the block so it describes the new rule. Focus loss always clears held input and pauses only when the pause-on-focus-loss setting is on, which is the default under D-15. Remove the old comment wording that described the unconditional pause. Leave the pointer-lock and fullscreen listeners unchanged.

Make no change to `src/input/keyboard.ts`. If `prettier --check` reports the changed files, run `docker compose run --rm lint npx prettier --write` on those files and re-run lint.
  </action>
  <verify>
    <automated>docker compose run --rm typecheck && docker compose run --rm lint</automated>
  </verify>
  <done>Typecheck and lint exit 0. `rg -n "session\.pause\(\)" src/main.ts` prints no lines. The baseline at HEAD is 3 matches (one in the old comment and two calls), so the gate changes state. `index.html` has exactly one `data-settings-toggle="pauseOnFocusLoss"` checkbox inside `#settings-panel`. `GameSession` exposes `focusLost`. The checkbox reflects the stored value on open and is reset to on by Reset all settings.</done>
</task>

<task type="auto">
  <name>Task 3: Cover the toggle in the browser, with the default-on path left untouched</name>
  <files>tests/e2e/settings.spec.ts</files>
  <read_first>tests/e2e/settings.spec.ts (StoredSettings, storedSettings helper, startAndLaunch, the existing blur and visibility test, the reset test), tests/e2e/helpers/probe.ts (getProbe)</read_first>
  <action>
Adds browser coverage for the toggle. Edit `tests/e2e/settings.spec.ts` only.

1. Add `pauseOnFocusLoss?: boolean;` to the `StoredSettings` interface.

2. Add one new test directly after the existing test "blur and visibility hidden auto-pause and clear held input". Title it "the focus-loss toggle decides whether blur and a hidden tab pause the game". Use the same console and pageerror collector as the neighbouring tests, and call `startAndLaunch(page)`. Then:
   a. Press KeyP, click the Settings button inside `#pause`, and expect `#settings-panel` to be visible. Expect the `[data-settings-toggle="pauseOnFocusLoss"]` checkbox to be checked, which is the default.
   b. Uncheck the checkbox. Read the stored blob with the existing `storedSettings(page)` helper and expect `pauseOnFocusLoss` to be `false`.
   c. Click Back in the settings panel, click Resume inside `#pause`, and expect `#pause` to be hidden.
   d. Read the probe clock with `getProbe`. Dispatch a synthetic `blur` on window. Wait with `waitForFunction` until the probe clock exceeds the value read before the blur, with a 15 s timeout. This proves the simulation runs. Then expect `#pause` to be hidden and the probe `paused` to be `false`.
   e. Override `document.visibilityState` to `hidden`, then dispatch `visibilitychange` on document. Expect `#pause` to be hidden and the probe `paused` to be `false`. Restore the property with `Reflect.deleteProperty`, as the neighbouring test does.
   f. Reload the page, call `startAndLaunch(page)` again, press KeyP, open Settings, and expect the checkbox to be unchecked. This proves the stored value survived.
   g. Check the checkbox again, click Back, click Resume, dispatch a `blur` on window, and expect `#pause` to be visible and the probe `paused` to be `true`. This proves the default-on path returns.
   h. Expect `errors` to equal an empty array.

3. Leave the existing blur and visibility test, the throttle spec, and every other test unchanged.
  </action>
  <verify>
    <automated>docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/settings.spec.ts tests/e2e/throttle.spec.ts"</automated>
  </verify>
  <done>The new focus-loss toggle test passes in Docker. The existing blur and visibility test passes unchanged, which proves the default-on path. The hidden-tab test in `throttle.spec.ts` passes unchanged.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage to settings validator | The `wegolite.settings` blob is attacker-controllable in the browser and crosses into the app on boot. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-261108-tez-01 | Tampering | `parseSettings` reading `pauseOnFocusLoss` | low | mitigate | Strict boolean check in `parseSettings`: any non-boolean value, including `null`, fails validation. `loadSettings` then backs up the blob and uses defaults. Covered by the unit tests added in Task 1. |
| T-quick-261108-tez-02 | Tampering | localStorage sets `pauseOnFocusLoss` to false | low | accept | The setting is a local, single-player preference. It has no server, no account, and no effect on other users. Pausing on focus loss is a convenience, not a security control. |
| T-quick-261108-tez-SC | Tampering | npm/pip/cargo installs | low | accept | This plan adds no dependency and has no install task, so the package-legitimacy gate does not apply. |
</threat_model>

<verification>
Every command runs in Docker. Host runs are not evidence.

1. `docker compose run --rm test npx vitest run tests/settings/schema.test.ts`
2. `docker compose run --rm typecheck`
3. `docker compose run --rm lint`
4. `rg -n "session\.pause\(\)" src/main.ts` prints nothing. Baseline at HEAD: 3 matches.
5. `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/settings.spec.ts tests/e2e/throttle.spec.ts"`
6. Once after all three tasks: `docker compose run --rm verify`, the full gate that CI runs.
</verification>

<success_criteria>
- The settings blob stays at version 1 and gains `pauseOnFocusLoss`. Every blob written before this change still loads with the toggle on.
- Toggle off: window blur and a hidden tab keep the simulation running, open no pause overlay, and still clear held keys.
- Toggle on (default): behaviour matches the current build. The existing blur and visibility e2e test and the hidden-tab test in `throttle.spec.ts` pass unchanged.
- The checkbox reflects the stored value when Settings opens, saves each change at once, and is reset to on by Reset all settings.
- A non-boolean stored value is rejected by the validator with a message that names `settings.pauseOnFocusLoss`.
- Typecheck, lint, the targeted Vitest file, and the targeted Playwright specs pass in Docker.
</success_criteria>

<output>
Create `.planning/quick/261108-tez-sdelat-postanovku-na-pauzu-pri-potere-fo/261108-tez-SUMMARY.md` when done.
</output>
