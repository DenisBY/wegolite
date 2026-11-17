---
phase: quick
plan: 261117-fpp
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/fps-counter.ts
  - src/settings/schema.ts
  - src/settings/store.ts
  - src/ui/settings-panel.ts
  - index.html
  - src/app/session/context.ts
  - src/app/session/settings-controller.ts
  - src/app/session/start-session.ts
  - src/app/session/frame-loop.ts
  - src/app/game-session.ts
  - src/main.ts
  - CHANGELOG.md
  - tests/ui/fps-counter.test.ts
  - tests/app/session/settings-controller.test.ts
  - tests/e2e/settings.spec.ts
  - tests/settings/schema.test.ts
  - tests/app/session/start-session.test.ts
  - tests/app/session-order.test.ts
  - docs/PERFORMANCE.md
  - README.md
autonomous: true
requirements: []

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "The pause menu's Settings panel has a 'Show FPS counter (frames per second)' checkbox. It is unchecked on a fresh profile and after Reset all settings."
    - "With the option on, a readout 'FPS: <n>' is visible at the right end of the bottom document strip, in flight and while docked. It changes at most once per 500 ms window. With the option off it is hidden at once."
    - "The choice is stored in the one `wegolite.settings` blob as `showFps: true`. It is written only when on, so a blob at the defaults keeps its current five-key shape. It survives a reload. A stored `showFps` that is not a boolean rejects the whole blob (strict parse, copied to `wegolite.settings.corrupt`, defaults used)."
    - "The rate counts animation frames: the `now` timestamp each pass of the session frame loop receives, not fixed sim ticks. Docked frames count even though the redraw gate skips their GPU draw. The counter reads no clock of its own."
    - "Nothing under src/sim or src/content changes. The probe, the world hash, the draw-call count and the redraw gate's `request()` call count are unchanged. The counter is a DOM text node, never a mesh or a HUD canvas element."
    - "Between readouts the counter makes no DOM write and no allocation. The session dispose path hides it and stops it, so a later frame writes nothing."
  artifacts:
    - path: src/ui/fps-counter.ts
      provides: "createFpsMeter (pure 500 ms frame-rate window), formatFps, createFpsCounter (DOM readout with setEnabled/frame/dispose)"
    - path: tests/ui/fps-counter.test.ts
      provides: "Node unit tests for the meter, the format and the counter's write throttling, enable/disable and dispose"
  key_links:
    - from: src/app/session/frame-loop.ts
      to: src/ui/fps-counter.ts
      via: "ctx.runtime.fpsCounter?.frame(now) right after probe.frames += 1"
    - from: src/app/session/start-session.ts
      to: src/ui/fps-counter.ts
      via: "createFpsCounter(fpsRoot) + setEnabled(loaded.showFps) in startSession; fpsCounter?.dispose() in dispose()"
    - from: src/ui/settings-panel.ts
      to: src/app/session/settings-controller.ts
      via: "onShowFpsChange -> applyShowFps (persist + fpsCounter.setEnabled); openSettings/resetAllSettings -> syncShowFpsToggle"
    - from: src/settings/store.ts
      to: src/settings/schema.ts
      via: "showFps parsed (allowlisted, boolean-or-absent), defaulted false, merged, written only when true"
    - from: src/main.ts
      to: index.html
      via: "requireElement(\"fps\") passed as GameSessionOptions.fpsRoot -> LifecycleDeps.fpsRoot"
---

# Quick task 261117-fpp: Show FPS option in Settings

Owner request, 2026-11-17: the owner cannot judge the frame rate by eye. Add a Settings option that shows an on-screen FPS counter. It is off by default, stored with the other settings, and shown in flight and while docked.

<objective>
Add a "Show FPS counter (frames per second)" checkbox to the pause menu's Settings panel. It drives a small DOM readout, "FPS: 60", at the right end of the bottom document strip. The readout covers 500 ms windows of animation frames, which are the session frame loop's `requestAnimationFrame` passes, not sim ticks. It is persisted in the settings blob, returned to off by Reset all settings, and torn down in the session dispose path. Unit-tested in Node, proven end to end by one Playwright spec, with a CHANGELOG entry in the same commit as the change.

Purpose: give the owner a number to read instead of a feeling. Keep the sim, the world hash, the probe and the frame budget untouched.

Output: `src/ui/fps-counter.ts`, a `showFps` settings field, the toggle and readout markup, session wiring, tests, the CHANGELOG entry, and a short note in `docs/PERFORMANCE.md` and README.md.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md

Reviewer and subagent brief (from AGENTS.md, binding):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Use the codebase-memory MCP index (project `wegolite`) before grepping. Prefer `rg` over `grep`.
- Browser tests, `verify` and `verify-full` run ONLY on the remote machine, through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <compose args>`. The wrapper sends the COMMITTED HEAD, so run it after the task commit. `test`, `lint` and `typecheck` run locally.
- Known flakes, so rerun once before treating a failure as real: `tools/oolite-ingest/convert/textures.test.ts` (5000 ms), e2e `launch.spec.ts:129` and `save-load.spec.ts:634`.

Design decisions (Claude's discretion, recorded here so the executor does not reinterpret them):

- **What is counted.** One count per pass of the session frame loop (`frame(now)` in `src/app/session/frame-loop.ts`). The time comes from the `now` argument (the `requestAnimationFrame` timestamp). This is the interval the `docs/PERFORMANCE.md` sampler already measures. Docked and paused frames still count: the redraw gate (quick task 261110-a3k) skips their GPU draw, but the page still presents at that rate. Counting only GPU draws would read about 0 docked and mislead.
- **Window.** 500 ms, restarted at each readout (frames counted in the window divided by its measured length). This is the method Oolite uses (`PlayerEntity.m` `fps_counter`, a `framesDoneThisUpdate` window of `MINIMUM_GAME_TICK` 0.25 s). It is widened to 0.5 s for a steadier reading and fewer DOM writes. A gap of more than 1000 ms between two frames, for example a hidden tab, restarts the window, so a stalled tab never shows a bogus low number.
- **Text.** `FPS: <n>` with `Math.round`, following Oolite's `dial_fpsinfo` format "FPS: %3d" without the padding. Before the first readout it shows the placeholder `FPS: --`. Oolite's own counter is a key-toggled HUD dial (`drawFPSInfoCounter`, `key_show_fps`). It is deliberately not reproduced: the owner asked for a Settings option, and it must also show while docked.
- **Placement.** A `<span id="fps">` inside the one document `<footer>` (`body > footer`, `position: fixed`, z-index 15), absolutely positioned at its top-right corner. That strip is already reserved on every screen: `#docked`, `#chart` and `#save-load` pad by `--document-footer-height`, and in flight it already overlays the view. The readout therefore covers no HUD gauge, no station header (credits sit top-right there) and no station footer row. It sits under the pause overlay (z-index 20), which is fine. It is a DOM text node, so it adds no draw call, no triangle and no `redrawGate.request()`.
- **Storage.** `showFps` is a new optional top-level settings key, with no version bump. This follows the `quality` precedent: absent reads as false, a non-boolean rejects the blob, and it is written only when true. Pre-release, an older build rejecting a blob that carries it is acceptable (alpha: compat may break).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: End-to-end "Show FPS" — stored setting, Settings toggle, live counter in the footer strip</name>
  <files>src/ui/fps-counter.ts, tests/ui/fps-counter.test.ts, src/settings/schema.ts, src/settings/store.ts, src/ui/settings-panel.ts, index.html, src/app/session/context.ts, src/app/session/settings-controller.ts, src/app/session/start-session.ts, src/app/session/frame-loop.ts, src/app/game-session.ts, src/main.ts, tests/app/session/settings-controller.test.ts, tests/e2e/settings.spec.ts, CHANGELOG.md</files>
  <read_first>
    - src/settings/schema.ts (parseSettings allowlist, the `pauseOnFocusLoss` and `quality` optional-field pattern, defaults, mergeDefaults, header comment)
    - src/settings/store.ts (saveSettings writes `quality` only when non-default)
    - src/ui/settings-panel.ts (requireToggle, the `highQuality` toggle, setQuality)
    - index.html lines 1257-1285 (`[hidden]` rule, `body > footer` CSS) and 1953-2001 (settings panel markup, footer markup)
    - src/app/session/settings-controller.ts (syncQualityToggle, applyQuality, openSettings, resetAllSettings)
    - src/app/session/start-session.ts lines 101-217 (LifecycleDeps), 436-441 (`const loaded = loadSettings()`), 663-688 (settings panel creation), 822-899 (dispose and its order comment)
    - src/app/session/frame-loop.ts (the whole file; the phase-order comment at the top)
    - src/app/session/context.ts lines 246-279 and 410-437 (SessionRuntime and its initial values)
    - src/app/game-session.ts lines 104-125, 182-197, 401-426, 488-547 (options, destructuring, settings controller, lifecycle deps)
    - src/main.ts lines 158-164 and 296-317 (requireElement roots, createGameSession call)
    - tests/app/session/settings-controller.test.ts lines 47-111 and 231-241 (harness doubles; the openSettings test pins the exact call list)
    - tests/e2e/settings.spec.ts lines 13-66 and 396-479 (helpers; the High-quality toggle spec is the model)
    - tests/app/redraw-gate.test.ts lines 136-160 (source pins: keep `probe.frames += 1;` verbatim; exactly five `redrawGate.request();`)
    - tests/guards/economy-purity.test.ts lines 330-335 (the session sources may not read a wall clock)
    - CHANGELOG.md lines 1-21 (Unreleased / Added style)
  </read_first>
  <behavior>
    - createFpsMeter: the first tick returns null; ticks every 20 ms from t=0 return null until t=500, which returns 50 (25 intervals / 500 ms); the next window restarts at that frame.
    - createFpsMeter: ticks every 10 ms return 100 at t=500; 1000/60 ms steps return a value toBeCloseTo 60.
    - createFpsMeter: a gap over 1000 ms (ticks at 0, 20, then 5000) returns null at 5000 and the next readout counts only frames after 5000; a timestamp that goes backwards also restarts the window; reset() makes the next tick start a fresh window.
    - formatFps: 59.6 gives "FPS: 60", 0.4 gives "FPS: 0", 144 gives "FPS: 144".
    - createFpsCounter on a plain object element {hidden, textContent}: construction leaves it hidden; frame() while disabled never writes textContent.
    - createFpsCounter enabled: hidden becomes false and the text shows the placeholder "FPS: --"; after frames every 20 ms through t=500 the text is "FPS: 50"; 2 s of frames every 10 ms make at most 5 textContent writes (placeholder plus one per window), not 200; an unchanged rounded value is not rewritten.
    - createFpsCounter: setEnabled(false) hides at once and stops writes; a later setEnabled(true) restarts the window, so frames from before the off period never count; setEnabled(true) twice does not reset a running window.
    - createFpsCounter: dispose() hides the element, clears its text, and any later frame() writes nothing.
  </behavior>
  <action>
Build the thinnest path through every layer first, in this order. Then run the e2e proof.

1. **Counter module (new `src/ui/fps-counter.ts`, GPL header like its siblings, no imports).** Write the tests in `tests/ui/fps-counter.test.ts` first, from the behavior block. They are Node-only (the Vitest environment is `node`): use a plain object element, and use an accessor `textContent` that counts writes.
   - Export `FPS_WINDOW_MS = 500`, `FPS_MAX_GAP_MS = 1000` and `FPS_PLACEHOLDER = "FPS: --"`.
   - Export `createFpsMeter(windowMs = FPS_WINDOW_MS, maxGapMs = FPS_MAX_GAP_MS)`. It returns `{ tick(now: number): number | null; reset(): void }` and keeps only numbers: the window start, the frame count and the last timestamp.
     - A tick with no window, with a gap over `maxGapMs`, or with `now` earlier than the last timestamp restarts the window at `now` and returns null.
     - Any other tick counts one frame. Once `now - windowStart >= windowMs` it returns `frames * 1000 / elapsed` and restarts the window at `now`.
   - Export `formatFps(fps: number): string`, which returns `FPS: ` followed by `String(Math.round(fps))`.
   - Export `type FpsElement = Pick<HTMLElement, "hidden" | "textContent">` and `interface FpsCounter { setEnabled(enabled: boolean): void; isEnabled(): boolean; frame(now: number): void; dispose(): void }`.
   - Export `createFpsCounter(element: FpsElement, meter = createFpsMeter()): FpsCounter`.
     - Construction sets `element.hidden = true`. The counter starts disabled, per the owner's "off by default".
     - `setEnabled(true)` on a disabled counter resets the meter, writes `FPS_PLACEHOLDER` and unhides. On an enabled counter it is a no-op.
     - `setEnabled(false)` hides. It is idempotent.
     - `frame(now)` returns at once when disabled. Otherwise it ticks the meter and writes `textContent` only on a readout whose formatted text differs from the last one written. It allocates nothing between readouts.
     - `dispose()` disables, hides and clears the text.
   - The module takes time only from its `now` arguments and reads no clock of its own. It writes text through `textContent` only, never as HTML. Keep its comments free of browser clock API names as well, because the acceptance gate greps the whole file.
2. **Settings field (`src/settings/schema.ts`, `src/settings/store.ts`).**
   - Add `showFps: boolean` to `SettingsV1`, with a doc comment in the style of `quality`: absent reads as false, a stored value must be a boolean.
   - Add `"showFps"` to the `allowedTopLevel` set.
   - In `parseSettings`, after `quality`, add the same strict-optional block `pauseOnFocusLoss` uses: `=== undefined` means false, and a non-boolean fails with `settings.showFps: expected a boolean`. A stored null is rejected. Return the field.
   - Set `showFps: false` in `defaults()` and copy it in `mergeDefaults`.
   - The header comment says "exactly five top-level keys", which is already stale. Correct it to the seven keys.
   - In `saveSettings`, spread `showFps: true` into the blob only when `normalized.showFps` is true, with a comment mirroring the `quality` one, so a blob at the defaults keeps its exact current shape. No `SETTINGS_VERSION` bump.
3. **Toggle and readout markup (`index.html`).**
   - In `#settings-panel`, after the High-quality `<p>`, add a `<p><label>` holding `<input type="checkbox" data-settings-toggle="showFps" />` and the exact label text `Show FPS counter (frames per second)`.
   - Inside `<footer>`, as its first child, add `<span id="fps" hidden aria-hidden="true"></span>`.
   - After the `body > footer a` rule, add a commented `#fps` rule: `position: absolute; top: 0.35rem; right: 1rem; color: #cfc;`. The comment explains it sits in the footer strip every screen reserves, inherits the footer's 12px monospace, and is not clickable because the footer is `pointer-events: none`. The existing `[hidden]` rule hides it.
4. **Panel (`src/ui/settings-panel.ts`).**
   - Add `readonly onShowFpsChange: (enabled: boolean) => void` to `SettingsPanelOptions`, and `setShowFps(enabled: boolean): void` to `SettingsPanel`, documented "without firing a change" like `setPauseOnFocusLoss`.
   - Get `requireToggle(root, "showFps")`. Add a `change` listener on the same AbortController signal that calls `onShowFpsChange(toggle.checked)`.
   - Implement `setShowFps` as setting `checked`.
   - Extend the header comment with the third toggle.
5. **Session state (`src/app/session/context.ts`).** Add `fpsCounter: FpsCounter | undefined` to `SessionRuntime` (type-only import from `../../ui/fps-counter.js`), with a one-line doc comment, and `fpsCounter: undefined` in `createSessionState`.
6. **Settings controller (`src/app/session/settings-controller.ts`).**
   - Add `syncShowFpsToggle()`, which pushes `ctx.runtime.settings?.showFps ?? false` into `ctx.runtime.settingsPanel?.setShowFps`.
   - Add `applyShowFps(enabled: boolean)`. It returns when `ctx.runtime.settings` is undefined. Otherwise it sets `settings.showFps`, calls `persistSettings()`, then `ctx.runtime.fpsCounter?.setEnabled(enabled)`.
   - Call `syncShowFpsToggle()` in `openSettings` right after `syncQualityToggle()`.
   - In `resetAllSettings`, after `syncQualityToggle()`, call `ctx.runtime.fpsCounter?.setEnabled(fresh.showFps)` then `syncShowFpsToggle()`.
   - Return both new functions. Read every field through `ctx` at call time (G-8).
7. **Lifecycle (`src/app/session/start-session.ts`).**
   - Add `readonly fpsRoot: HTMLElement` (doc: the FPS readout in the document footer) and `readonly applyShowFps: SettingsController["applyShowFps"]` to `LifecycleDeps`, and destructure both.
   - In `startSession`, pass `onShowFpsChange: (enabled) => { applyShowFps(enabled); }` to `createSettingsPanel`.
   - Right after that call, set `ctx.runtime.fpsCounter = createFpsCounter(fpsRoot)` and `ctx.runtime.fpsCounter.setEnabled(loaded.showFps)`. `loaded` is the `loadSettings()` result already read before the first scene.
   - In `dispose()`, call `ctx.runtime.fpsCounter?.dispose()` immediately after `ctx.runtime.settingsPanel?.dispose()`. Add "and the FPS counter" to step 4 of the teardown-order comment.
8. **Frame loop (`src/app/session/frame-loop.ts`).**
   - Insert `ctx.runtime.fpsCounter?.frame(now);` on the line right after `probe.frames += 1;`. Leave that line byte-identical, because `tests/app/redraw-gate.test.ts` pins it.
   - The call sits before the live guards, so chart-open, save-screen and paused frames count too.
   - Update phase 1 of the header comment to "reschedule, count (`probe.frames`) and tick the FPS counter".
   - Add no `redrawGate.request()`: the readout is DOM text and the canvas is not stale.
9. **Facade and boot (`src/app/game-session.ts`, `src/main.ts`).**
   - Add `readonly fpsRoot: HTMLElement` to `GameSessionOptions` (doc: the `#fps` readout in the document footer, Settings > Show FPS counter).
   - Destructure it, destructure `applyShowFps` from `settingsController`, and pass both into `createSessionLifecycle`.
   - In `main.ts`, add `const fpsRoot = requireElement("fps");` beside `settingsRoot` and pass `fpsRoot` to `createGameSession`.
10. **Keep the existing suite green (`tests/app/session/settings-controller.test.ts`).**
    - The harness's settingsPanel double has no `setShowFps`, so `openSettings` would now throw. Add a recording `setShowFps: (on: boolean) => calls.push(\`settings.setShowFps(${String(on)})\`)` to the double and `showFps: false` to the harness settings.
    - In the "openSettings hides the controls panel and mirrors the stored toggles" expectation, insert `"settings.setShowFps(false)"` between `"settings.setQuality(standard)"` and `"settings.show"`.
11. **E2E proof (`tests/e2e/settings.spec.ts`).**
    - Add `showFps?: boolean` to `StoredSettings`.
    - Append the test "the Show FPS toggle shows a live counter in flight and docked, persists and resets". Model it on the High-quality test: collect console and page errors, and use `test.setTimeout(240_000)`.
      a. Call `startAndLaunch`. `#fps` is hidden.
      b. Press KeyP, open Settings. `[data-settings-toggle="showFps"]` is not checked. Check it. `storedSettings(page).showFps` is `true`.
      c. Back, Resume. `#fps` is visible and `toHaveText(/^FPS: \d+$/, { timeout: 15_000 })`, which proves a real readout, not the placeholder.
      d. `page.reload()`, `waitForReady`, `startNewGame`. `#docked` is visible, and `#fps` is visible with the same regex while docked.
      e. Launch: click `button[data-action="launch"]` and wait for `mode === "inFlight"` as `startAndLaunch` does. Press KeyP, open Settings. The toggle is checked. Click `[data-settings-action="reset"]`. The `wegolite.settings` item is null, `#fps` is hidden and the toggle is unchecked.
      f. `errors` is empty.
12. **CHANGELOG (`CHANGELOG.md`, same commit as the code).** Under `## [Unreleased]` / `### Added`, append this bullet in the file's prose style: "The pause menu's Settings panel has a "Show FPS counter" option, off by default. When it is on, the game's frame rate appears as "FPS: 60" at the right end of the bottom strip, in flight and while docked, refreshed twice a second. The choice is stored with your other settings, and Reset all settings turns it off."

Do not touch anything under `src/sim/` or `src/content/`, the probe (`src/app/probe.ts`, `probe-publisher.ts`), the render driver or the redraw gate. Add no dependency. Commit the task through the quick workflow's task commit. Code and CHANGELOG go in one commit. Then run the remote e2e below.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/ui/fps-counter.test.ts tests/settings/schema.test.ts tests/app/session/settings-controller.test.ts tests/app/session/start-session.test.ts tests/app/session-order.test.ts tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts && docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/settings.spec.ts"</automated>
    <fails_when>
      - Any targeted Vitest file fails. In particular, `redraw-gate.test.ts` fails if `probe.frames += 1;` changed or a sixth `redrawGate.request();` appeared, and `economy-purity.test.ts` fails if a session file reads a wall clock.
      - typecheck fails because a `GameSessionOptions` or `LifecycleDeps` field is missing.
      - The new e2e test cannot see `#fps` in flight or docked, sees only `FPS: --` after 15 s, finds no `showFps: true` in the blob, or finds the counter still visible after Reset.
      - The remote wrapper prints "note: uncommitted tracked edits are not included" for this task's files. That means it tested a stale HEAD: commit, then rerun.
    </fails_when>
  </verify>
  <acceptance_criteria>
    - `rg -F 'showFps' src/settings/schema.ts | wc -l` [HEAD=0 EXPECT>=5]
    - `rg -F 'showFps' src/settings/store.ts | wc -l` [HEAD=0 EXPECT>=1]
    - `rg -F 'data-settings-toggle="showFps"' index.html | wc -l` [HEAD=0 EXPECT==1]
    - `rg -F 'Show FPS counter (frames per second)' index.html | wc -l` [HEAD=0 EXPECT==1]
    - `rg -F 'id="fps"' index.html | wc -l` [HEAD=0 EXPECT==1]
    - `rg -F 'fpsCounter?.frame(now)' src/app/session/frame-loop.ts | wc -l` [HEAD=0 EXPECT==1]
    - `rg -F 'fpsCounter?.dispose()' src/app/session/start-session.ts | wc -l` [HEAD=0 EXPECT==1]
    - `rg -F 'requireElement("fps")' src/main.ts | wc -l` [HEAD=0 EXPECT==1]
    - `test -f src/ui/fps-counter.ts && ! rg -q 'performance\.now\(|Date\.now\(|innerHTML' src/ui/fps-counter.ts; echo $?` [HEAD=1 EXPECT==0] (the module exists and reads no clock and writes no HTML)
    - `sed -n '/^## \[Unreleased\]/,/^## \[0.4.0\]/p' CHANGELOG.md | rg -F 'Show FPS counter' | wc -l` [HEAD=0 EXPECT==1]
    - Invariant, not a change measure: `git diff --quiet 58f059b -- src/sim src/content src/app/probe.ts src/app/session/probe-publisher.ts src/app/redraw-gate.ts` exits 0, meaning none of these files changed.
    - The new `tests/ui/fps-counter.test.ts` passes, and the remote `settings.spec.ts` run reports all its tests passed, the new one included.
  </acceptance_criteria>
  <done>A player can tick "Show FPS counter" in Settings and see a live "FPS: n" at the bottom-right in flight and docked. The choice survives a reload, Reset turns it off, and the remote browser spec proves this chain. The code and its CHANGELOG entry are committed together.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Harden the edges — strict parse, controller, frame-loop and dispose tests; frame-budget note</name>
  <files>tests/settings/schema.test.ts, tests/app/session/settings-controller.test.ts, tests/app/session-order.test.ts, tests/app/session/start-session.test.ts, docs/PERFORMANCE.md, README.md</files>
  <read_first>
    - tests/settings/schema.test.ts lines 35-76 (FakeStorage, validBlob) and 409-482 (the graphics-quality describe and the five-key blob test, which must stay green unchanged)
    - tests/app/session/settings-controller.test.ts (as left by Task 1)
    - tests/app/session-order.test.ts lines 1090-1260 (frameHarness and its phase-order tests)
    - tests/app/session/start-session.test.ts lines 52-58 (disposable) and 368-440 (liveHarness, TEARDOWN)
    - docs/PERFORMANCE.md lines 1-20 and 66-90 (budget table, the sampler's "interval between animation frames")
    - README.md lines 160-175 (Performance section)
  </read_first>
  <behavior>
    - Schema: defaults().showFps is false; a blob without showFps reads false; an explicit true survives validateSettings; "yes", 1, null, {} and [] each make validateSettings return null and settingsProblem contain "settings.showFps".
    - Store: saveSettings at showFps false writes no showFps key (the existing five-key test stays as is); saveSettings with showFps true writes `showFps: true` and loadSettings reads it back true; a stored blob with showFps "yes" is copied to SETTINGS_CORRUPT_KEY and loadSettings returns showFps false.
    - Controller: applyShowFps(true) sets ctx.runtime.settings.showFps and calls fpsCounter.setEnabled(true); with ctx.runtime.settings undefined it touches neither the counter nor the settings; resetAllSettings calls fpsCounter.setEnabled(false) then settings.setShowFps(false).
    - Frame loop: with ctx.runtime.fpsCounter set to a recording double, frame(1234) logs "fps 1234" before "consumePauseToggle"; a chart-open frame and a paused frame still tick it once each; probe.frames still increments.
    - Dispose: with ctx.runtime.fpsCounter = disposable(log, "fpsCounter"), TEARDOWN contains "fpsCounter.dispose" directly after "settingsPanel.dispose", exactly once, and a second dispose() adds nothing.
  </behavior>
  <action>
Add Node unit tests that pin the edges Task 1 relies on. Make each one fail first against a deliberately broken local edit, then revert the edit, to be sure it is not vacuous. Then write the short frame-budget note.

1. `tests/settings/schema.test.ts`: add a `describe("show FPS", ...)` beside the graphics-quality one, covering the schema and store cases in the behavior block, with `validBlob()` and `FakeStorage`. Leave "writes exactly one version-1 blob with no extra keys" unchanged: it proves the default blob's shape did not grow.
2. `tests/app/session/settings-controller.test.ts`:
   - Add a recording `fpsCounter` double to the harness: `ctx.runtime.fpsCounter = { setEnabled: (on) => calls.push(\`fps.setEnabled(${String(on)})\`) } as never`.
   - Add the applyShowFps cases.
   - For resetAllSettings, `resetSettings()` defaults its storage to the global `localStorage`, which Node may not define. Stub it with `vi.stubGlobal("localStorage", <Map-backed getItem/setItem/removeItem object>)` and call `vi.unstubAllGlobals()` in a `finally` or `afterEach`.
   - Assert `fps.setEnabled(false)` comes before `settings.setShowFps(false)` in `calls`.
   - `persistSettings` is a no-op in this harness (bindings are undefined); say so in a comment rather than asserting a write.
3. `tests/app/session-order.test.ts`, inside the frame-loop describe that owns `frameHarness`: add the three frame-loop cases.
   - Set `ctx.runtime.fpsCounter = { frame: (now: number) => log.push(\`fps ${String(now)}\`) } as never` on the harness ctx.
   - For chart-open set `ctx.chart.chartOpen = true`. For paused set `ctx.runtime.paused = true`.
   - Do not change the existing literal phase-order expectations: they run without a counter and must stay byte-identical.
4. `tests/app/session/start-session.test.ts`:
   - In `liveHarness`, add `ctx.runtime.fpsCounter = disposable(log, "fpsCounter") as never` after the settingsPanel line.
   - In `TEARDOWN`, insert `"fpsCounter.dispose"` right after `"settingsPanel.dispose"`.
   - The existing "exactly once" assertions then cover the idempotence.
5. `docs/PERFORMANCE.md`: after the paragraph that ends "It has no frame-rate evidence yet; measure it with the reference-desktop protocol below before changing the default.", add one short paragraph saying:
   - the Settings "Show FPS counter" option shows the animation-frame rate over 500 ms windows, the same interval the sampler below measures, as a quick on-screen reading;
   - it is not QUAL-01 evidence and does not replace the reference-desktop protocol;
   - it is a DOM text element in the document footer, so it adds no draw call and no triangles;
   - docked it reports the loop rate, while the redraw gate skips unchanged GPU draws.
6. `README.md`, Performance section: add one sentence after the High-quality paragraph saying Settings also has a "Show FPS counter" option, off by default, that shows the frame rate on screen, and that the protocol in `docs/PERFORMANCE.md` remains the measurement of record.

No production code changes in this task. If a new test exposes a real defect in Task 1's code, fix it in the code here and add it to the CHANGELOG bullet only if player-visible behaviour changes. Commit through the quick workflow's task commit. Then run the remote `verify` gate.
  </action>
  <verify>
    <automated>docker compose run --rm test && docker compose run --rm lint && docker compose run --rm typecheck</automated>
    <automated>/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify</automated>
    <fails_when>
      - A new schema case passes with the `showFps` block removed from parseSettings, which means the test is vacuous.
      - The TEARDOWN test still passes after `fpsCounter?.dispose()` is deleted from dispose().
      - The frame-loop case passes with the tick moved below the chart-open return.
      - The full unit suite, lint, typecheck or the remote `verify` (lint, typecheck, content drift, unit tests, build, e2e smoke subset) is red, after one rerun of a known flake.
    </fails_when>
  </verify>
  <acceptance_criteria>
    - `rg -F 'showFps' tests/settings/schema.test.ts | wc -l` [HEAD=0 EXPECT>=6]
    - `rg -F 'applyShowFps' tests/app/session/settings-controller.test.ts | wc -l` [HEAD=0 EXPECT>=2]
    - `rg -F 'fpsCounter' tests/app/session-order.test.ts | wc -l` [HEAD=0 EXPECT>=1]
    - `rg -F '"fpsCounter.dispose"' tests/app/session/start-session.test.ts | wc -l` [HEAD=0 EXPECT==1]
    - `rg -F 'Show FPS counter' docs/PERFORMANCE.md | wc -l` [HEAD=0 EXPECT==1]
    - `rg -F 'Show FPS counter' README.md | wc -l` [HEAD=0 EXPECT==1]
    - Invariant, not a change measure: `git diff --quiet 58f059b -- src/sim src/content` exits 0.
    - Local `test`, `lint`, `typecheck` and the remote `verify` all exit 0.
  </acceptance_criteria>
  <done>Every edge the feature relies on is pinned by a Node test: the strict parse, the default blob shape, the controller's apply and reset, the per-frame tick and the dispose order. The frame-budget doc says what the counter is and is not. The fast gate is green on the remote machine.</done>
</task>

</tasks>

## Artifacts this phase produces

| Artifact | Kind | Purpose |
| --- | --- | --- |
| `src/ui/fps-counter.ts` | new | `createFpsMeter` (500 ms frame window, 1000 ms gap reset), `formatFps` ("FPS: n"), `createFpsCounter` (throttled DOM readout with `setEnabled`, `frame`, `dispose`) |
| `tests/ui/fps-counter.test.ts` | new | Node tests for the meter, the format, the write throttling, enable/disable and dispose |
| `src/settings/schema.ts`, `src/settings/store.ts` | modified | `showFps` field: allowlisted, strict boolean-or-absent, default false, written only when true |
| `index.html` | modified | the `showFps` checkbox in Settings; `<span id="fps">` in the document footer and its `#fps` CSS rule |
| `src/ui/settings-panel.ts` | modified | `onShowFpsChange`, `setShowFps` |
| `src/app/session/context.ts`, `settings-controller.ts`, `start-session.ts`, `frame-loop.ts`, `src/app/game-session.ts`, `src/main.ts` | modified | `ctx.runtime.fpsCounter`; `applyShowFps` and `syncShowFpsToggle`; reset path; creation from the loaded settings; dispose; the per-frame tick; the `fpsRoot` option |
| `tests/e2e/settings.spec.ts` | modified | browser proof: toggle, stored blob, live readout in flight and docked, reset |
| `tests/settings/schema.test.ts`, `tests/app/session/settings-controller.test.ts`, `tests/app/session-order.test.ts`, `tests/app/session/start-session.test.ts` | modified | edge tests (strict parse, controller, frame-loop tick, dispose order) |
| `CHANGELOG.md` | modified | `[Unreleased]` / Added bullet, in the same commit as the code |
| `docs/PERFORMANCE.md`, `README.md` | modified | one note each: the counter is a convenience reading, not QUAL-01 evidence, and adds no draw call |

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage -> settings parser | `wegolite.settings` is attacker-controlled (any script or extension on the origin, or a hand edit); the new `showFps` key crosses here |
| session frame loop -> DOM | the counter writes into a live document node every readout |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-fpp-01 | Tampering | `parseSettings` in src/settings/schema.ts (`showFps`) | medium | mitigate | `"showFps"` joins the top-level allowlist, and nothing else does. Absent means false. Any non-boolean, null included, rejects the whole blob with `settings.showFps: expected a boolean`, and the existing `loadSettings` path copies the raw blob to `wegolite.settings.corrupt` and uses defaults. Pinned by the Task 2 schema/store cases. |
| T-fpp-02 | Denial of service | `createFpsCounter().frame` in src/ui/fps-counter.ts | low | mitigate | No DOM write and no allocation per frame. At most one `textContent` write per 500 ms window, and only when the rounded text changes. A gap of more than 1000 ms restarts the window. Pinned by the Task 1 write-count test. |
| T-fpp-03 | Tampering | determinism and world hash (src/sim, src/content), probe | low | mitigate | No file under src/sim, src/content, the probe or the redraw gate changes (the `git diff --quiet 58f059b` invariant). The counter reads only the rAF `now` passed to `frame(now)`. The session sources keep the economy-purity clock ban (`tests/guards/economy-purity.test.ts`). |
| T-fpp-04 | Information disclosure / injection | `#fps` element | low | mitigate | The readout carries only a number from our own arithmetic, written with `textContent` (never HTML; the Task 1 gate rejects `innerHTML` in the module), `aria-hidden`, inside the existing non-interactive footer. |
| T-fpp-SC | Tampering | npm/pip/cargo installs | low | accept | This plan installs no package and adds no dependency (AGENTS.md). There is no install task, so the legitimacy checkpoint does not apply. |
</threat_model>

<verification>
- Local, Docker: `docker compose run --rm test`, `docker compose run --rm lint`, `docker compose run --rm typecheck`, all exit 0.
- Remote, after each task commit: Task 1 runs `wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/settings.spec.ts"`, Task 2 runs `wegolite-remote-run.sh run --rm verify`, and both exit 0.
- `git diff --quiet 58f059b -- src/sim src/content` exits 0, so the sim and the world hash are untouched.
- The NPC acceptance run is not required: nothing under src/sim/npc, src/sim/world or ships-npc.json changes.
- `verify-full` is not required: the change is browser-facing UI and settings, not render, input, persistence (IndexedDB saves) or network-guard code. Settings live in localStorage under src/settings.
</verification>

<success_criteria>
- Settings shows "Show FPS counter (frames per second)", unchecked by default.
- Checked: "FPS: n" appears at the bottom-right in flight and docked, updating about twice a second. Unchecked: it disappears at once.
- The choice persists across a reload as `showFps: true`. Reset all settings clears it. A tampered value rejects the blob.
- No sim, content, probe, redraw-gate or draw-call change. No per-frame DOM write. The counter is disposed with the session.
- The CHANGELOG `[Unreleased]` / Added entry ships in the same commit as the code. The unit tests, lint, typecheck and remote `verify` and settings e2e are green.
</success_criteria>

<output>
Create `.planning/quick/261117-fpp-add-a-show-fps-on-off-option-to-settings/261117-fpp-SUMMARY.md` when done. Record the commits, the gate results (local test/lint/typecheck, remote e2e settings spec, remote verify), and any flake reruns.
</output>
