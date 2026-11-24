---
phase: quick
plan: 261124-pze
type: execute
wave: 1
depends_on: []
files_modified:
  - src/input/keyboard.ts
  - src/app/session/frame-loop.ts
  - src/app/game-session.ts
  - src/app/session/start-session.ts
  - src/app/session/station-controller.ts
  - src/app/session/save-controller.ts
  - src/app/session/context.ts
  - src/app/session/chart-controller.ts
  - src/ui/station.ts
  - tools/oolite-ingest/convert/commodities.ts
  - tests/input/station-actions.test.ts
  - tests/input/bindings.test.ts
  - tests/app/session/queued-edge-flush.test.ts
  - tests/app/session/station-controller.test.ts
  - tests/app/session/save-controller.test.ts
  - tests/e2e/station-fkeys.spec.ts
  - FIDELITY.md
  - CHANGELOG.md
  - .planning/PROJECT.md
  - .planning/ROADMAP.md
autonomous: true
requirements: [ECON-09, SAVE-05, FLGT-06, ECON-04]

estimate:
  tokens: 140000
  raw_tokens: 140000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "F2 (key order): on the F2 screen with no save, KeyS then F3 delivered in one frame write the save first and then open Outfitting; with a save present the same pair opens the overwrite question and F3 then does nothing"
    - "F2 (key order): on the docked chart, Escape then F6 in one frame end with the chart open at the local preset (closed, then reopened); on an in-flight chart Escape then F4 sets the starboard view and Escape then F6 takes the queued flight chart path"
    - "F2 (key order): a docked screen key with nothing queued before it behaves exactly as before; F2 then S in one frame still saves on the newly opened F2 screen; frame() and its pinned phase order in tests/app/session-order.test.ts are unchanged"
    - "F1: while the Save/Load overwrite question is open, F2, F3, F4, F5, F6, F8 and the digit aliases change nothing (no screen switch, the question stays open), matching the tab-strip click and Oolite's overwrite screen (pollControls = NO)"
    - "F3: no saveLoad edge is ever queued and applySaveScreenAction has no saveLoad arm; applyChartAction's chart arm is documented as reachable only from flight"
    - "F5: a Load whose IndexedDB read resolves after the F2 screen was closed installs nothing, also when the screen was opened again before the read resolved"
    - "F11: from a focused text field only the docked screen keys (STATION_NAV_ACTIONS) can fire; the chart's Find planet box keeps its behaviour, and every F1-F8 keydown pressed from #chart-find-input has defaultPrevented true in the browser"
    - "F4: the e2e 'F2 on Save/Load is ignored' case fails on a close-and-reopen (no hidden-attribute mutation of #save-load allowed)"
    - "F6: createBindingMap({ stationMarket: ['KeyS'] }) gives stationMarket ['KeyS'] and saveScreenSave [] (pinned by a unit test), and CHANGELOG [Unreleased] tells the player; no migration"
    - "F10: the market comment line's title attribute equals its full text (empty for the default no-comment case)"
    - "F7/F8/F9: PROJECT.md and ROADMAP.md name v0.8.0 as the latest release and the docked F-key bugs as fixed; CHANGELOG and the FIDELITY F-key rows mention the digit aliases 3, 4, 5, 8; FIDELITY E-188 is narrowed to plain text or one whole [key] token; the unreachable empty-comment branch of resolveComment is gone; a new faithful FIDELITY row E-189 records the inert keys under the overwrite question with a verbatim 7437f22 excerpt"
    - "F12: the station-controller test titled for the Market and the Manifest exercises both"
    - "Gates: local test, lint, typecheck and assets:check green; tests/guards/dead-mode-gates.test.ts still pins 5 for src/app/session/station-controller.ts with no re-pin; remote Chromium station-fkeys, station, save-load and chart-gestures, remote verify-full and remote e2e-cross green on the committed HEAD; nothing pushed"
  artifacts:
    - path: src/input/keyboard.ts
      provides: "setQueuedEdgeFlush, flush-then-re-resolve before the synchronous screen sink, textField-scoped F-key bypass, no saveLoad queue routing"
      contains: "setQueuedEdgeFlush"
    - path: src/app/session/frame-loop.ts
      provides: "createQueuedEdgeFlush mirroring frame steps 3 and 6"
      contains: "export function createQueuedEdgeFlush"
    - path: src/app/session/start-session.ts
      provides: "LifecycleDeps.flushQueuedEdges registered on the input source"
      contains: "setQueuedEdgeFlush"
    - path: src/app/session/station-controller.ts
      provides: "navigateByKey inert while the overwrite question is open"
      contains: "isConfirming"
    - path: src/app/session/save-controller.ts
      provides: "saveScreenGeneration bump in closeSaveScreen and compare after the Load await"
      contains: "saveScreenGeneration"
    - path: tests/app/session/queued-edge-flush.test.ts
      provides: "flush routing rules and the two finding sequences through the real input state"
      contains: "createQueuedEdgeFlush"
    - path: tests/e2e/station-fkeys.spec.ts
      provides: "defaultPrevented recorder, MutationObserver on #save-load, same-frame key-order cases, comment title"
      contains: "defaultPrevented"
    - path: FIDELITY.md
      provides: "digit aliases in the F-key rows, narrowed E-188, new E-189 row and excerpt"
      contains: "### E-189 src/Core/Entities/PlayerEntityLoadSave.m"
  key_links:
    - from: src/app/game-session.ts
      to: src/app/session/frame-loop.ts
      via: "createQueuedEdgeFlush(ctx, { handleChartActions, handleSaveScreenActions, applyStationAction }) passed as LifecycleDeps.flushQueuedEdges"
      pattern: "createQueuedEdgeFlush\\("
    - from: src/app/session/start-session.ts
      to: src/input/keyboard.ts
      via: "ctx.runtime.input.setQueuedEdgeFlush registered beside setStationScreenHandler"
      pattern: "setQueuedEdgeFlush\\("
    - from: src/input/keyboard.ts
      to: src/app/session/station-controller.ts
      via: "flush, then (context unchanged) the synchronous sink navigateByKey; (context changed) the same code resolved again"
      pattern: "onStationScreen"
    - from: src/app/session/save-controller.ts
      to: src/app/session/context.ts
      via: "ctx.save.saveScreenGeneration bumped by closeSaveScreen, compared after store.read()"
      pattern: "saveScreenGeneration"
---

<objective>
Fix the twelve consolidated code-review findings F1 to F12 in
`.planning/quick/261124-pze-fix-code-review-findings-for-the-docked-/261124-pze-FINDINGS.md` for the
docked F-keys, the second F5 press and the market comment line. The two "Accepted, no change" items stay
untouched. Every decision written in the findings file is locked: F1 keys inert while the overwrite dialog is
open; F6 no migration, a CHANGELOG note and a pinning test.

Purpose: keys pressed in one frame apply in the order they were pressed, the overwrite question cannot be
dismissed by a screen key, a stale Load cannot install, dead code and an over-broad text-field bypass go, and
the docs match the shipped behaviour.

**F2 design (planner's choice, the simplest that keeps key order).** The docked screen key stays synchronous,
because queuing it would break the docked-f-keys guarantee that the next key in the same frame resolves against
the new screen (F2 then S must save on the F2 screen). Before the input layer hands a screen key to the
synchronous sink, it asks the session to flush the edges queued earlier in that frame. The session flush applies
them with the same routing rules as the frame (chart edges, then Save/Load edges, then docked station edges). If
the flush changed the input context (for example, Escape closed the chart), the input layer resolves the same key
code again against the new context. So:
- Escape then F6 on the docked chart reopens the chart.
- On an in-flight chart, Escape then F4 is the starboard view.
- S then F3 saves first.

The re-resolution is bounded. The flush drains every queue, and `setContext` clears them, so the second pass has
nothing to flush. `frame()` stays untouched, so the pinned frame phase order does not move. The flush covers the
three screen queues the finding names. A queued sim command (the dockHome `launch`) still drops on a context
change, as before.

Coverage (every finding maps to a task; no deferred items, no research artifact):
- F1 (inert keys under the overwrite question): Task 1 code and test, Task 3 FIDELITY E-183/E-189 and CHANGELOG
- F2 (same-frame key order): Task 1 code and unit tests, Task 3 e2e cases and CHANGELOG
- F3 (dead F2 toggle branches, chart-arm comment): Task 2
- F4 (e2e defaultPrevented recorder, tighter F2-ignored case): Task 3
- F5 (Load generation counter): Task 2 code and test, Task 3 CHANGELOG
- F6 (binding collision pin): Task 2 test, Task 3 CHANGELOG
- F7 (stale planning docs): Task 3
- F8 (digit aliases in docs): Task 3
- F9 (E-188 wording, unreachable branch): Task 3
- F10 (comment line title): Task 3
- F11 (text-field bypass scope): Task 2
- F12 (test title): Task 1

Output: the code and test changes above, docs, three atomic commits, and the gate results in the SUMMARY.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/quick/261124-pze-fix-code-review-findings-for-the-docked-/261124-pze-FINDINGS.md
@src/input/keyboard.ts
@src/app/session/frame-loop.ts
@src/app/session/station-controller.ts
@src/app/session/save-controller.ts

Brief for every executor or subagent (AGENTS.md "Reviewer and subagent brief"):
- Tests and builds run in Docker only. Host Node, npm and Playwright are not authoritative, and a green host run is
  not evidence.
- Commands:
  - `docker compose run --rm test` (Vitest)
  - `docker compose run --rm test npx vitest run <file>` (targeted)
  - `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser)
  - `docker compose run --rm e2e-cross`
  - `docker compose run --rm typecheck`
  - `docker compose run --rm lint`
  - `docker compose run --rm verify`
- A reproduction that needs a scratch script or test lives under `/tmp`, mounted with `-v /tmp/<dir>:/scratch`.
  Never add scratch files to the repository.
- Browser tests run on the remote test machine only, through
  `/home/opencode/.claude/scripts/wegolite-remote-run.sh <compose args>`. That script syncs the COMMITTED HEAD, so
  commit before every remote run.
- Use the codebase-memory MCP (project `wegolite`, and `oolite` for the Oolite checkout) when it is available.
  Otherwise prefer `rg` over `grep`.
- Read Oolite behaviour from `/home/opencode/git/oolite` (read only). Its HEAD is 21978c37b, not the pin 7437f22.
  For any FIDELITY excerpt or line number, read the pinned file with
  `git -C /home/opencode/git/oolite show 7437f22:<path>`.
- Do NOT push and do not tag. Commit messages and every committed file are in English.

Facts measured at planning time (HEAD f77b8947):
- `setContext` in `src/input/keyboard.ts` clears `stationActions`, `chartActions` and `saveScreenActions`.
- `saveLoad` is live only in dockHome, dockScreen and chart, all outside flight, so it always reaches the
  synchronous sink.
- In flight, F2, F3 and F4 are the aft, port and starboard views, and F6 is the queued chart.
- In the frame (`src/app/session/frame-loop.ts`):
  - step 3 is `handleChartActions(drainChartActions())`, then the Save/Load edges, which are dropped while the chart
    is open;
  - step 6 applies the station edges only when no overlay is open, the game is not paused and the mode is docked.
- The dead-mode-gates pins:
  - `src/app/session/station-controller.ts` = 5 negative mode comparisons;
  - `src/app/session/frame-loop.ts` = 0;
  - `src/app/session/save-controller.ts` = 2;
  - `src/app/session/start-session.ts` = 3.
  - Nothing in this plan may add a negative FlightMode comparison. Use `=== "docked"` where a mode check is needed.
- `ACTION_IDS` order: the station section actions come before `chart`, the `chart*` actions, `saveLoad` and the
  `saveScreen*` actions. `createBindingMap` lets the earlier entry keep a shared code.
- At pin 7437f22:
  - `setGuiToOverwriteScreen` is `src/Core/Entities/PlayerEntityLoadSave.m:778-786`, with `pollControls = NO` at
    line 784;
  - `pollGuiScreenControlsWithFKeyAlias` returns early on `!pollControls && fKeyAlias` at
    `src/Core/Entities/PlayerEntityControls.m:3896-3897`.
  - So Oolite does not poll the F-keys on its overwrite screen, and F1 is faithful.
- `readComment` in `tools/oolite-ingest/convert/commodities.ts` maps an absent or empty plist comment to the
  default token before `resolveComment` runs.
- The probe exposes `saveScreen.confirming`, `saveScreen.open`, `save.status` and `save.committed`.
- `#save-load` shows and hides through its `hidden` attribute.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Same-frame key order across a docked screen key (F2), screen keys inert under the overwrite question (F1), honest test title (F12)</name>
  <files>src/input/keyboard.ts, src/app/session/frame-loop.ts, src/app/game-session.ts, src/app/session/start-session.ts, src/app/session/station-controller.ts, tests/input/station-actions.test.ts, tests/app/session/queued-edge-flush.test.ts, tests/app/session/station-controller.test.ts</files>
  <behavior>
    - Saving first: saveScreen context with a registered flush and sink, KeyS then F3. The flush sees saveScreenSave
      before the sink receives stationOutfitting.
    - Docked chart: chart context, Escape then F6. The flush applies chartBack (context back to dockHome), and the
      sink then receives chart.
    - In-flight chart: chart context whose flush returns to flight.
      - Escape then F4 queues the starboard setView command and the sink receives nothing.
      - Escape then F6 puts chart on the chart queue.
    - Nothing queued: a screen key never calls the flush.
    - No flush registered: behaviour is identical to today.
    - createQueuedEdgeFlush routing:
      - chart edges always reach handleChartActions;
      - Save/Load edges reach handleSaveScreenActions with the chart closed and are discarded with it open;
      - station edges are applied only when docked with no overlay open and not paused, and are discarded otherwise;
      - in the game-over state everything is drained and nothing applied.
    - navigateByKey with ctx.save.saveLoad.isConfirming() true: each of the six screen actions changes nothing.
      With isConfirming() false, F3 still closes the F2 screen and opens Outfitting.
  </behavior>
  <action>
F2, input layer (src/input/keyboard.ts):
- Add `setQueuedEdgeFlush(flush: () => void): void` to the InputState interface. Its doc says the session's flush of
  the queued screen edges runs before a docked screen key reaches the synchronous sink, so an edge pressed earlier
  in the same frame applies against the screen it was pressed on.
- Hoist the keyDown body into a named inner function, so it can call itself, and return it from the object.
- In the branch where a STATION_NAV_ACTIONS action fires outside the flight context:
  - when a flush is registered and any of stationActions, chartActions or saveScreenActions holds an edge, note the
    context and call the flush;
  - if the context changed during the flush, return the result of resolving the same code again
    (`keyDown(code, false, mods)`), so the key lands on the screen the earlier keys left;
  - otherwise call the sink as today.
- Update the module header and the setStationScreenHandler doc to describe the flush and the re-resolution, and why
  the recursion is bounded (the flush drains every queue and setContext clears them).

F2, session (src/app/session/frame-loop.ts):
- Export `createQueuedEdgeFlush(ctx, deps)`. `deps` is `Pick<LoopDeps, "handleChartActions" |
  "handleSaveScreenActions" | "applyStationAction">`, and the function returns `() => void`.
- The body mirrors the frame:
  - no `ctx.runtime.input`: return;
  - `ctx.runtime.gameOver`: drain the three screen queues and return (step 2);
  - `handleChartActions(input.drainChartActions())`;
  - the Save/Load edges, dropped while `ctx.chart.chartOpen`, else `handleSaveScreenActions` (step 3);
  - drain the station edges, and apply each with `applyStationAction` only when the chart is closed, the F2 screen
    is closed, the game is not paused and `ctx.core.state?.mode === "docked"` (step 6). Write a positive comparison
    only: this file is pinned at 0 negative mode comparisons.
- Leave `frame()` exactly as it is. Add a short paragraph to the header doc naming the flush and the steps it
  mirrors.

F2, wiring:
- src/app/game-session.ts: build `flushQueuedEdges` with `createQueuedEdgeFlush(ctx, { handleChartActions,
  handleSaveScreenActions, applyStationAction })` next to `createFrameLoop`, and pass it into the
  `createSessionLifecycle` deps.
- src/app/session/start-session.ts:
  - add `readonly flushQueuedEdges: () => void` with a doc line to LifecycleDeps, and destructure it;
  - right after `setStationScreenHandler`, register `ctx.runtime.input.setQueuedEdgeFlush(() => {
    flushQueuedEdges(); })`.
  - Tests that build LifecycleDeps with `as unknown as LifecycleDeps` need no change. Confirm with the start-session
    test run.

F1 (src/app/session/station-controller.ts, navigateByKey):
- Add `ctx.save.saveLoad?.isConfirming() === true` to the first guard block, exactly as navigateStation does.
- Rewrite the doc comment: drop the claim that closing the F2 screen also cancels an open overwrite dialog. Say
  instead that while the overwrite question is open every docked screen key does nothing, like the tab-strip click.
  This is faithful to Oolite: `setGuiToOverwriteScreen` sets `pollControls = NO`
  (PlayerEntityLoadSave.m:784 at 7437f22), and `pollGuiScreenControlsWithFKeyAlias` then returns early
  (PlayerEntityControls.m:3896-3897).
- Add no FlightMode comparison to this file (the guard pin stays 5).

Tests:
- tests/input/station-actions.test.ts: a new describe "same-frame key order across a docked screen key (quick
  261124-pze F2)" covering the input-layer behaviour bullets. Use a shared log array for the flush and sink order.
- New file tests/app/session/queued-edge-flush.test.ts:
  - start it with the SPDX and copyright header and a doc comment, like its siblings;
  - Node only: createSessionState with the laveFixture system, `initFlightState(layout)` as ctx.core.state, and a
    real createInputState cast as ctx.runtime.input;
  - cover the createQueuedEdgeFlush routing bullets, plus the two finding sequences end to end through the real
    input state, with the flush registered and recording doubles whose chartBack closes the chart (chartOpen false,
    setContext dockHome) and whose sink opens the target;
  - the sequences: KeyS then F3 handles saveScreenSave before the sink gets stationOutfitting; Escape then F6 on the
    docked chart ends with the chart open.
- tests/app/session/station-controller.test.ts:
  - in the navigateByKey describe, add the F1 case from the behaviour bullets. The double is
    `ctx.save.saveLoad = { isConfirming: () => true }` cast through unknown, with saveScreenOpen true. Assert calls
    stay empty, saveScreenOpen stays true and stationScreen is unchanged.
  - F12: make "F5 from the Market or from the Manifest of another visit opens Status page 1" exercise the Manifest
    too: F5, F5 (page 2), F8 (Market), F5 lands on Status page 1. Alternatively split it into two accurately titled
    cases.

Commit as `fix(quick-261124-pze): keep same-frame key order across a docked screen key; screen keys inert under
the overwrite question`, with the attribution trailer from the session.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/input/station-actions.test.ts tests/input/bindings.test.ts tests/app/session/queued-edge-flush.test.ts tests/app/session/station-controller.test.ts tests/app/session-order.test.ts tests/app/session/start-session.test.ts tests/app/session/sim-driver.test.ts tests/guards/dead-mode-gates.test.ts && docker compose run --rm typecheck && [ "$(rg -v '^\s*(//|\*|/\*)' src/app/session/station-controller.ts | grep -c 'isConfirming')" -ge 2 ] && [ "$(rg -v '^\s*(//|\*|/\*)' src/app/session/frame-loop.ts | grep -c 'export function createQueuedEdgeFlush')" -eq 1 ] && [ "$(rg -v '^\s*(//|\*|/\*)' src/app/session/start-session.ts | grep -c 'setQueuedEdgeFlush')" -ge 1 ]</automated>
    Gate baselines: isConfirming in station-controller code [HEAD=1 EXPECT>=2]; createQueuedEdgeFlush export [HEAD=0 EXPECT==1]; setQueuedEdgeFlush in start-session code [HEAD=0 EXPECT>=1]; dead-mode-gates pins unchanged (station-controller 5, frame-loop 0) with no edit to tests/guards/dead-mode-gates.test.ts.
  </verify>
  <done>
- The two finding sequences pass at unit level: S then F3 saves before navigating; Escape then F6 leaves the chart
  open.
- The in-flight re-resolution cases pass.
- The F1 unit case passes, and the F12 test covers the Manifest.
- frame() and session-order.test.ts are unchanged and green.
- The dead-mode guard passes without a re-pin, typecheck is green, and the commit is made.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Remove the dead F2 toggle (F3), generation-guard the Load (F5), scope the text-field bypass (F11), pin the binding collision (F6)</name>
  <files>src/input/keyboard.ts, src/app/session/save-controller.ts, src/app/session/context.ts, src/app/session/chart-controller.ts, tests/input/bindings.test.ts, tests/app/session/save-controller.test.ts</files>
  <behavior>
    - Text-field scope: with `createBindingMap({ chartRange: ["F7"] })` in the chart context:
      - `keyDown("F7", false, { shift: false, textField: true })` returns true and queues nothing;
      - the same key without textField queues chartRange;
      - F6 with textField true still reaches the synchronous sink.
    - Binding collision: `createBindingMap({ stationMarket: ["KeyS"] })` gives stationMarket ["KeyS"] and
      saveScreenSave []; `createBindingMap({ chartUp: ["Digit8"] })` gives stationMarket ["F8", "Digit8"] and
      chartUp [].
    - Load generation:
      - the generation rises by one per closeSaveScreen of an open screen, and by none for a closed one;
      - a Load whose deferred read resolves after closeSaveScreen and a reopen (saveScreenOpen true again) installs
        nothing: state, profile and market stay the same objects, and loadingSave ends false.
    - No saveLoad edge: in every context, no saveLoad edge reaches drainSaveScreenActions.
  </behavior>
  <action>
F3, dead branches:
- src/input/keyboard.ts: in the queue routing, remove the saveLoad alternative from the condition that pushes onto
  saveScreenActions. Only `action.startsWith("saveScreen")` routes there. saveLoad fires only outside flight, so it
  always reaches the synchronous sink.
- src/app/session/save-controller.ts: delete the saveLoad arm of the switch in applySaveScreenAction, which toggled
  the screen closed and contradicted "F2 on its own screen does nothing". Adjust any doc line that mentions it.
- src/app/session/chart-controller.ts: add a comment on the `chart` arm of applyChartAction. It is reachable only
  from flight: docked F6 goes through navigateByKey, and the re-resolution of Task 1 sends an in-flight F6 here
  after a same-frame Escape.
- Run `rg -n '"saveLoad"' tests` and update any test that feeds saveLoad to
  handleSaveScreenActions/applySaveScreenAction, or expects it from drainSaveScreenActions, to the new truth. No
  test may pin the dead toggle.

F5, Load generation:
- src/app/session/context.ts: add `saveScreenGeneration: number` to SessionSaveState. Its doc says it is bumped by
  every closeSaveScreen of an open screen, and an in-session Load compares it across its IndexedDB await. Initialise
  it to 0 in createSessionState.
- src/app/session/save-controller.ts:
  - closeSaveScreen increments it right after its open-flag early return;
  - loadFromSave captures it before `await saveBoot.store.read()`, and the post-await guard also returns when it
    changed;
  - update the G-8 comment to say a closed, or a closed and reopened, screen must not receive a Load the player
    walked away from;
  - loadingSave still resets in the finally block.
- Add no mode comparison (the save-controller pin stays 2).

F11, text-field scope (src/input/keyboard.ts):
- Add `readonly textField?: boolean` to KeyModifiers, and widen its doc to the modifier and source state of a
  keydown.
- In keyDown, the contextual filter also requires `mods?.textField !== true || STATION_NAV_ACTIONS.has(action)`.
  The reserved F-key return for an empty list stays, so an F-key from a text field is still reported handled.
- In onKeyDown, compute `isTextTarget(event.target)` once, keep the early return for non-reserved keys, and pass
  `{ shift: event.shiftKey, textField }` to `state.keyDown`.
- The Task 1 re-resolution passes mods through unchanged.
- Update the isTextTarget doc and the onKeyDown comment: from a text field only the docked screen keys pass, so a
  future text field does not inherit any other F-key binding.
- The Find planet box is unchanged: its F2 to F6 and F8 are all STATION_NAV_ACTIONS, and F1 and F7 already fire
  nothing in the chart context.

F6, pinning test only (tests/input/bindings.test.ts):
- Add a describe for stored blobs after the context widening, with the two createBindingMap cases from the behaviour
  bullets.
- A comment cites quick 261124-pze F6 and the alpha policy: no migration, CHANGELOG note in Task 3. The earlier
  ACTION_IDS entry keeps a shared code.
- Do not change createBindingMap.

Tests:
- tests/input/bindings.test.ts: the text-field scope cases and the no-saveLoad-edge assertion.
- tests/app/session/save-controller.test.ts: the Load generation cases, next to the existing "(c) a read that
  resolves after F2 was closed" test and using its deferred read pattern.

Commit as `fix(quick-261124-pze): drop the dead F2 toggle, guard a Load across a closed F2 screen, scope the
text-field F-key bypass`, with the attribution trailer.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/input tests/app/session/save-controller.test.ts tests/app/session/chart-controller.test.ts tests/app/session/station-controller.test.ts tests/app/session/queued-edge-flush.test.ts tests/guards/dead-mode-gates.test.ts && docker compose run --rm typecheck && docker compose run --rm lint && [ "$(rg -v '^\s*(//|\*|/\*)' src/input/keyboard.ts | grep -cF 'action === "saveLoad"')" -eq 0 ] && [ "$(rg -v '^\s*(//|\*|/\*)' src/app/session/save-controller.ts | grep -cF 'case "saveLoad"')" -eq 0 ] && [ "$(rg -v '^\s*(//|\*|/\*)' src/app/session/save-controller.ts | grep -c 'saveScreenGeneration')" -ge 3 ] && [ "$(rg -v '^\s*(//|\*|/\*)' src/input/keyboard.ts | grep -c 'textField')" -ge 2 ]</automated>
    Gate baselines: saveLoad queue clause in keyboard code [HEAD=1 EXPECT==0]; saveLoad switch arm in save-controller code [HEAD=1 EXPECT==0]; saveScreenGeneration in save-controller code [HEAD=0 EXPECT>=3]; textField in keyboard code [HEAD=0 EXPECT>=2]; dead-mode-gates pins unchanged.
  </verify>
  <done>
- No dead F2 toggle remains in keyboard.ts or save-controller.ts.
- A Load across a closed or reopened F2 screen installs nothing.
- Text-field F-keys are scoped to the docked screen keys.
- The F6 collision is pinned.
- The input and session tests, typecheck, lint and the dead-mode guard (no re-pin) are green, and the commit is
  made.
  </done>
</task>

<task type="auto">
  <name>Task 3: Comment title (F10), comment resolver (F9), browser proofs (F4, F2, F1, F10), docs (F1, F6, F7, F8, F9), then the local and remote gates</name>
  <files>src/ui/station.ts, tools/oolite-ingest/convert/commodities.ts, tests/e2e/station-fkeys.spec.ts, FIDELITY.md, CHANGELOG.md, .planning/PROJECT.md, .planning/ROADMAP.md</files>
  <precondition>The remote test machine answers through /home/opencode/.claude/scripts/wegolite-remote-run.sh (needed for the browser gates after the commit).</precondition>
  <action>
F10 (src/ui/station.ts):
- Where renderMarket sets the comment line's textContent, also set its title to `model.commentText`. It is empty for
  the default no-comment case, so no tooltip shows.

F9 (tools/oolite-ingest/convert/commodities.ts, resolveComment):
- Delete the empty-string early return. It is unreachable, because readComment already maps an absent or empty
  plist comment to the default token.
- Narrow the doc comment to "the subset of OOExpand the vendored plist uses: plain text, or one whole [key] token".
- The generated content must not change.

F4, F2, F1, F10 (tests/e2e/station-fkeys.spec.ts):
- Recorder:
  - in boot(), after the session is up, use page.evaluate to add a bubble-phase window keydown listener (it runs
    after the game's own listeners). It records `{ code, targetId, defaultPrevented }` for codes F1 to F8 into a
    window array;
  - expectNoReload also asserts that every recorded entry has defaultPrevented true;
  - keep the __fkeysNoReload marker, but correct its comment: it only catches a real navigation, synthetic presses
    never reload, and the recorded defaultPrevented is the evidence that F5 is cancelled.
- Find-box test:
  - assert a recorded entry with targetId `chart-find-input` and defaultPrevented true for every code in KEYS;
  - add one F7 press from the focused box: the chart stays open, the box keeps focus, and the entry is prevented.
- F2-on-Save/Load case in pressFrom:
  - before the press, install a MutationObserver on `#save-load` (attributes, attributeFilter hidden) that counts
    records into a window variable;
  - after settleFrames, assert zero records, so a close-and-reopen (two hidden toggles) fails.
- Same-frame test: add a test "keys pressed in one frame apply in order (quick 261124-pze)", with a helper that, in
  ONE page.evaluate, dispatches a keydown then a keyup on window for each code in a list. Use synthetic
  KeyboardEvent objects with code, key, bubbles and cancelable. One task means every key lands before the next
  animation frame.
  1. Open the F2 screen by tab click and assert `save.status` is `absent`. Dispatch KeyS, F3. Expect place
     outfitting and `save.committed` at its previous value plus one.
  2. Return to F2 by tab click (the status is now valid). Dispatch KeyS, F3. After settleFrames, expect
     `saveScreen.confirming` true and the place still saveLoad: S applied first and opened the question, and F3 was
     inert under it (F1).
  3. Press Escape. Expect confirming false, still on saveLoad. Press F3. Expect outfitting.
  4. Open the chart by tab click. Dispatch Escape, F6. After settleFrames, expect place chart at LOCAL_SPAN (closed,
     then reopened fresh).
  5. Expect no console errors.
- In the F8 market test, assert the comment line's title equals "It is illegal to export this good from
  Cooperative stations." with Slaves selected, and "" with Food.

Docs:
- CHANGELOG.md [Unreleased], in the player's terms, with no internal names:
  - Fixed: keys pressed together now apply in the order pressed (S then F3 on the Save/Load screen saves first;
    Escape then F6 on the chart opens the chart again).
  - Fixed: while the Save/Load overwrite question is open, the screen keys do nothing until you answer it, as in
    Oolite.
  - Fixed: a Load that was still reading when you left the Save/Load screen no longer takes effect when you open the
    screen again.
  - Changed: the digit keys 3, 4, 5 and 8 (Oolite's stand-ins for F3, F4, F5 and F8) also work on the chart and the
    Save/Load screen. This came with 0.8.0 and was not noted then. Typing in the chart's search box is unchanged.
  - Changed: a custom key binding saved before 0.8.0 that gave Market, Outfitting, Status or Interfaces a key the
    chart or the Save/Load screen also uses now keeps that key for the station screen, and the other action loses it
    (for example, Market on S leaves Save without a key). Rebind it in Controls; old settings are not migrated.
  - Extend the existing comment-line bullet under Added: pointing at the line shows the full note when it is cut
    short.
- FIDELITY.md:
  - E-183 row: add the digit aliases (3, 4, 5, 8 for F3, F4, F5, F8; typed, not acting, inside the chart's Find
    planet box), and add that while the overwrite question is open the keys do nothing.
  - E-185 and E-186 rows: name digit 5 and digit 8.
  - Rows E-183 to E-186: update the Wegolite cells to the current navigateByKey lines (`rg -n` after Tasks 1 and 2).
  - E-188 row: narrow the mechanic to a comment that is plain text or one whole `[key]` token expanded through
    `descriptions.plist`. These are the only shapes the vendored plist uses, and the content build refuses any other
    OOExpand construct. Keep it faithful.
  - New table row right after E-188: "While the Save/Load overwrite question is open the docked screen keys do
    nothing (quick 261124-pze)", Wegolite cell `src/app/session/station-controller.ts:<line of the new guard>`,
    Oolite cell `src/Core/Entities/PlayerEntityLoadSave.m:778-786`, faithful, E-189.
  - New excerpt block after E-188's: heading `### E-189 src/Core/Entities/PlayerEntityLoadSave.m:778-786`, in the
    same objc-fenced format, with the nine lines copied verbatim from `git -C /home/opencode/git/oolite show
    7437f22:src/Core/Entities/PlayerEntityLoadSave.m`. The mechanic text may name pollGuiScreenControlsWithFKeyAlias
    at PlayerEntityControls.m:3896-3897 in prose.
- .planning/PROJECT.md line 13 and .planning/ROADMAP.md line 23: replace the stale v0.7.0 latest-release claim. The
  latest release is v0.8.0, tagged 2026-11-24, and it carries the v2.3 work; the quick tasks since then sit under
  `[Unreleased]`.
- .planning/ROADMAP.md line 95:
  - say the docked F-key bugs (the two 2026-11-22 todos, now in .planning/todos/completed) were fixed by debug
    session docked-f-keys and released in v0.8.0;
  - state the pending-todo count measured with `ls .planning/todos/pending | wc -l` (37 at planning time), keeping
    the note that 39 were acknowledged at the v2.3 close.
- Leave STATE.md to the orchestrator.

Commit as `docs(quick-261124-pze): ...` together with the F10, F9 and e2e changes, or split src/tests and docs into
two commits, each with the attribution trailer.

Gates, in order, after the commit:
1. Local: `docker compose run --rm test`, then `docker compose run --rm lint`, then `docker compose run --rm
   typecheck`, then `docker compose run --rm assets npm run assets:check` (the resolver edit must leave the
   generated content byte-identical).
2. Fidelity verbatim check:
   - extract the pinned tree with `git -C /home/opencode/git/oolite archive 7437f22 src` into /tmp/oolite-7437f22;
   - run `docker compose run --rm -v /tmp/oolite-7437f22:/oolite -e OOLITE_SRC=/oolite test npx vitest run
     tests/contract/fidelity.test.ts`.
3. Remote Chromium specs: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run
   build:e2e && npx playwright test tests/e2e/station-fkeys.spec.ts tests/e2e/station.spec.ts
   tests/e2e/save-load.spec.ts tests/e2e/chart-gestures.spec.ts --project=chromium"`.
4. Remote `run --rm verify-full`. AGENTS.md requires verify-full for input and persistence changes.
5. Remote `run --rm e2e-cross`.

On any failure, find the cause, fix it, commit, and rerun the failed gate and every later gate. Record each gate's
exit code, snapshot SHA and elapsed time in the SUMMARY. Do not push.
  </action>
  <verify>
    <automated>docker compose run --rm test && docker compose run --rm lint && docker compose run --rm typecheck && docker compose run --rm assets npm run assets:check && [ "$(rg -v '^\s*(//|\*|/\*)' tools/oolite-ingest/convert/commodities.ts | grep -cF 'authored === ""')" -eq 0 ] && [ "$(grep -c 'defaultPrevented' tests/e2e/station-fkeys.spec.ts)" -ge 1 ] && [ "$(grep -c 'MutationObserver' tests/e2e/station-fkeys.spec.ts)" -ge 1 ] && [ "$(grep -c '^### E-189 src/Core/Entities/PlayerEntityLoadSave.m:778-786$' FIDELITY.md)" -eq 1 ] && ! rg -q 'latest release is .v0\.7\.0' .planning/PROJECT.md .planning/ROADMAP.md && [ "$(grep -c 'Digit\|digit keys' CHANGELOG.md)" -ge 1 ] && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/station-fkeys.spec.ts tests/e2e/station.spec.ts tests/e2e/save-load.spec.ts tests/e2e/chart-gestures.spec.ts --project=chromium" && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify-full && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e-cross</automated>
    Gate baselines: empty-comment branch in commodities.ts code [HEAD=1 EXPECT==0]; defaultPrevented in station-fkeys spec [HEAD=0 EXPECT>=1]; MutationObserver in station-fkeys spec [HEAD=0 EXPECT>=1]; E-189 heading [HEAD=0 EXPECT==1]; stale v0.7.0 latest-release claim in PROJECT.md and ROADMAP.md [HEAD=2 EXPECT==0]; digit mention in CHANGELOG [HEAD=0 EXPECT>=1]. Also run the OOLITE_SRC fidelity check described in the action.
  </verify>
  <done>
- The comment line carries its full text as a title.
- resolveComment has no unreachable branch, and assets:check is unchanged.
- The e2e proves:
  - F2 to F8 from the Find box are defaultPrevented;
  - F2 on the F2 screen causes no hide or show;
  - S+F3 and Escape+F6 apply in order in one frame;
  - F3 is inert under the overwrite question;
  - the comment title is set.
- CHANGELOG, FIDELITY (E-183, E-185, E-186, E-188, new E-189 verbatim at 7437f22), PROJECT.md and ROADMAP.md are
  current.
- These gates are green, with results recorded in the SUMMARY: local test, lint, typecheck, assets:check and
  OOLITE_SRC fidelity; remote Chromium specs, verify-full and e2e-cross.
- Nothing is pushed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser keyboard → input layer | Keydown events, including ones from a focused text field, cross into game actions |
| IndexedDB → session | An async Load result arrives after the player may have left the F2 screen |
| localStorage settings blob → binding map | A stored custom binding table is reloaded and sanitised |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pze-01 | Elevation of privilege | `onKeyDown`/`keyDown` text-field bypass in src/input/keyboard.ts | low | mitigate | F11: the `textField` flag limits keys from a text field to STATION_NAV_ACTIONS; unit-tested with an F7 binding in the chart context |
| T-pze-02 | Tampering | `loadFromSave` post-await guard in src/app/session/save-controller.ts | medium | mitigate | F5: `saveScreenGeneration`, bumped by closeSaveScreen and compared after `store.read()`, so a stale read never installs over a reopened screen; unit-tested |
| T-pze-03 | Repudiation | Overwrite question dismissed by a screen key | low | mitigate | F1: navigateByKey returns while `isConfirming()`, matching navigateStation and Oolite's `pollControls = NO`; unit and e2e tested |
| T-pze-04 | Denial of service | Re-resolution recursion in keyDown | low | mitigate | It recurses only when the flush changed the context; the flush drains every queue and setContext clears them, so depth is at most 2; unit-tested sequences |
| T-pze-05 | Tampering | Stored binding blob losing a code in createBindingMap | low | accept | Alpha policy (no players): no migration. The rule (earlier ACTION_IDS entry keeps the code) is deterministic, pinned by a unit test and told in CHANGELOG |
| T-pze-SC | Tampering | npm/pip/cargo installs | high | accept | No package is added or installed by this plan; the package-legitimacy gate does not apply |
</threat_model>

<verification>
- Unit:
  - the two finding sequences, the in-flight re-resolution, the flush routing rules, the F1 inert keys and the F12
    Manifest case (Task 1);
  - the F3 dead code gone, the F5 generation guard, the F11 scope and the F6 pin (Task 2).
- Guard: tests/guards/dead-mode-gates.test.ts is green with station-controller still pinned at 5, and the guard
  file is not edited.
- Browser, remote Chromium:
  - station-fkeys: the recorder, the MutationObserver, the same-frame order, the overwrite question and the comment
    title;
  - station, save-load and chart-gestures.
- Release gates: remote verify-full and remote e2e-cross.
- Docs: the CHANGELOG [Unreleased] entries, the FIDELITY contract (also with OOLITE_SRC on 7437f22), and the
  PROJECT.md and ROADMAP.md release lines.
</verification>

<success_criteria>
- All twelve findings F1 to F12 are fixed as the findings file decides, and the two Accepted items are untouched.
- Keys pressed in one frame apply in the order pressed, on both the F2 screen and the chart.
- Three (or four) atomic commits on main, none pushed.
- Every listed gate is green on the final committed HEAD, with results in the SUMMARY.
</success_criteria>

<output>
Create `.planning/quick/261124-pze-fix-code-review-findings-for-the-docked-/261124-pze-SUMMARY.md` when done.
</output>
