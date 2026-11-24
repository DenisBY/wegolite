---
status: resolved
trigger: "docked-f-keys: On the docked screens F2-F6 and F8 mostly do nothing, and when they act the result is unexpected; a second F6 on the chart returns to the previous screen instead of doing what Oolite does. Owner report from the Phase 19 UAT. See todos .planning/todos/pending/2026-11-22-bug-docked-f-keys-unreliable.md and 2026-11-22-bug-f6-toggles-back-to-previous-screen.md (fix together)."
created: 2026-11-24
updated: 2026-11-24
---

## Symptoms

- expected: From every docked screen (Home, Market, Outfitting, Interfaces, Status, Save/Load, Chart), each advertised F-key (F2 Save/Load, F3 Outfitting, F4 Interfaces, F5 Status, F6 Chart, F8 Market) opens its screen on the first press, in Chromium and Firefox. A second F6 on the chart does what Oolite does (Oolite: repeated F6 toggles short-range <-> galactic chart; see /home/opencode/git/oolite/src/Core/Entities/PlayerEntityControls.m ~3940-3960), or a divergence recorded in FIDELITY.md.
- actual: Docked, dev build: F2, F3, F4, F5, F6, F8 "almost don't work, and when they do, not the way you expect". On F4 Interfaces, F6 opens the Chart; a second F6 returns to F4 Interfaces (acts as toggle back to previous screen).
- errors: none reported.
- timeline: Found in Phase 19 UAT (2026-11-22). Not yet reproduced or diagnosed.
- reproduction: Dock at a station, press the F-keys from various docked screens; for F6: F4 -> F6 -> F6.

## Leads (from todos)

- Which input context consumes the key: same codes bound in several places (stationOutfitting F3 vs in-flight viewPort F3, stationInterfaces F4 vs viewStarboard F4, saveLoad F2 vs viewAft F2, chart F6); result depends on the active context table in src/input/actions.ts.
- Whether the browser gets the key first (F5 reload, F3/F6 browser shortcuts) despite RESERVED_F_KEYS; whether focus on a tab-strip button or the chart search box swallows it.
- Whether the press fires on screens other than Home.
- Files: src/input/actions.ts, src/input/bindings.ts, src/ui/docked.ts, src/app/session/station-controller.ts.
- Done-when requires a browser spec pressing each key from each docked screen and asserting the screen shown, plus F4 -> F6 -> F6.

## Current Focus

- COORDINATOR UPDATE (session manager, 2026-11-24, relayed mid-rework; read before committing):
  1. HEAD is 0ba3cd1 (amended 46d9617). It re-pins tests/guards/dead-mode-gates.test.ts: the count for
     src/app/session/station-controller.ts went 4 -> 5 for the `currentState.mode !== "docked"` check in
     navigateByKey. Keep that re-pin; if the rework changes the number of negative mode checks in
     station-controller.ts, re-pin again, or the full unit suite fails on that guard alone.
  2. The remote Chromium run on the OLD fix (F6 range switch) passed 56/56 (station-fkeys, station-tabs,
     chart-gestures, save-load, station, game-over-guard, hyperspace); log:
     /tmp/claude-1027/-home-opencode-git-wegolite/df5840cd-f17f-4d52-8840-3acb682581b8/scratchpad/remote-e2e-1.log.
     After the rework, rerun at least station-fkeys and chart-gestures remotely, then remote verify and
     remote e2e-cross.
  3. The done-todo folder is .planning/todos/completed/ (NOT done/). The earlier debugger already stripped
     its Resolution notes from the two pending todos.
  4. Out of scope, do not implement: in Oolite a second F5 on Status opens Manifest and a second F8 on
     Market opens Market Info. Only add a new pending todo under .planning/todos/pending/ noting this
     unrecorded divergence.

- bug_class: Bohrbug (deterministic context-table and routing logic; no timing involved)
- status: RESOLVED (2026-11-24, continuation debugger). Rework per the owner decision done and amended into
  24e112c (not pushed); every gate green (see Evidence and Resolution.verification). Coordinator items:
  (1) the dead-mode-gates re-pin (5) is kept, the rework adds no negative mode check; (2) station-fkeys and
  chart-gestures (and the other five specs) rerun remotely after the rework, then remote verify and remote
  e2e-cross; (3) the todos moved to .planning/todos/completed/; (4) the F5/F8 second-press divergence is the
  new pending todo .planning/todos/pending/2026-11-24-second-f5-f8-press-oolite-subscreens.md (not
  implemented).
- next_action: none; session archived to .planning/debug/resolved/.

```yaml
reasoning_checkpoint:
  hypothesis: >-
    Three independent code gaps plus one wrong toggle produce every reported symptom.
    (1) ACTION_CONTEXTS lists stationMarket/Outfitting/Status/Interfaces and saveLoad only for dockHome and
    dockScreen, and chart not for saveScreen, so on the Chart and Save/Load screens keyDown finds no live
    action, reports the reserved F-key handled and fires nothing.
    (2) applyChartAction("chart") closes an open chart, and closeChart restores contextBeforeChart, so a
    second F6 returns to the previous screen.
    (3) onKeyDown returns early for a text target and shouldCancelReservedKey exempts text targets, so with
    the chart search box focused an F-key neither navigates nor is cancelled (F5 can reload the page).
  confirming_evidence:
    - "actions.ts ACTION_CONTEXTS: station screen actions and saveLoad = [dockHome, dockScreen]; chart lacks saveScreen"
    - "keyboard.ts keyDown: contextual.length === 0 -> return RESERVED_F_KEYS.has(code) (handled, nothing fires)"
    - "chart-controller.ts applyChartAction: case chart -> chartOpen ? closeChart() : openChart()"
    - "coordinator live repro (real dev app): Home and the section screens work on the first press; Chart: F2/F3/F4/F5/F8 inert, F6 returns to Interfaces; Save/Load: every F-key inert; focused search box: F-keys not preventDefaulted, nothing fires"
  falsification_test: >-
    After adding the chart and saveScreen contexts, the synchronous docked navigation sink and the F6
    preset toggle, a browser spec that presses F2, F3, F4, F5, F6 and F8 once from Home, Market, Outfitting,
    Interfaces, Status, Save/Load, the Chart and the focused search box must land on the target every time;
    any miss disproves the hypothesis that these gaps are the whole cause.
  fix_rationale: >-
    The fix ports Oolite's pollDockedControls rule (F-keys are polled on every docked GUI screen) by making
    the six navigation actions live in the chart and saveScreen contexts and routing them, while docked,
    through one synchronous sink that closes the open overlay and opens the target in press order; F6 on an
    open chart switches the local and galaxy presets (Oolite's short- and long-range charts) instead of
    closing; and an F1-F8 key is never text input, so it reaches the game and is cancelled from the search box.
  blind_spots: >-
    Firefox under xvfb may treat F6/F3 differently (browser chrome shortcuts) - covered by adding the new
    spec to the Firefox project. Real hardware keyboards (Fn lock, OS shortcuts) cannot be covered by a spec.
  candidate_causes:
    - "code: context table (actions.ts) and chart toggle (chart-controller.ts) and text-target early return (keyboard.ts)"
    - "config: a stale persisted bindings blob without the F-keys - ruled out: F2/F3/F5/F6/F8 are defaults since 2026-11-06 and Home/section screens work in the live repro"
    - "environment: browser or OS grabs the F-keys first - ruled out for Chromium by the live repro (keydowns preventDefaulted, home works)"
  and_gate: >-
    no - the causes are OR-ed, not AND-ed: each gap alone produces its own subset of the symptom (chart
    keys, save keys, search-box keys, second F6). root_cause is therefore a set of independent causes,
    all fixed together.
```

- fix committed locally as 46d9617 (not pushed).
- HANDOVER NOTE (first debugger, 2026-11-24, written after it saw the rework in the working tree): HEAD is now
  0ba3cd1, not 46d9617. The first debugger amended 46d9617 to add the re-pin in
  tests/guards/dead-mode-gates.test.ts ("src/app/session/station-controller.ts": 4 -> 5, for
  navigateByKey's `currentState.mode !== "docked"`; it fails closed for dead/launching/inFlight). Without it
  the full unit suite fails (that run: 7563 passed, 1 failed, only that guard). If the rework changes the
  count of negative mode comparisons in station-controller.ts, re-pin it again. The first debugger also
  removed its own uncommitted Resolution sections from the two pending todos (they described the dropped
  preset switch) and made no other edits after it saw the rework. Remote Chromium on 46d9617 (old F6
  semantics): station-fkeys, station-tabs, chart-gestures, save-load, station, game-over-guard and hyperspace
  specs, 56/56 passed in 214 s; log at
  /tmp/claude-1027/-home-opencode-git-wegolite/df5840cd-f17f-4d52-8840-3acb682581b8/scratchpad/remote-e2e-1.log.
  Remote verify and e2e-cross were not run.
- REWORK IN PROGRESS (continuation debugger, 2026-11-24): status back to fixing. Plan: remove
  `switchChartRange` (chart-controller, station-controller deps, game-session wiring); `navigateByKey("chart")`
  and `applyChartAction("chart")` on an open chart return without touching preset or camera; rewrite E-184;
  CHANGELOG/README; unit tests and the F4 -> F6 -> F6 (and x3) spec assert chart open + preset + camera
  unchanged; local test/lint/typecheck; amend 46d9617; remote targeted Chromium specs, remote verify, remote
  e2e-cross (foreground); record counts here; close session.
- (superseded) next_action: read the remote Chromium run of station-fkeys + station-tabs + chart-gestures + save-load +
  station + game-over-guard + hyperspace specs; then remote `verify` and remote `e2e-cross` (Firefox).
- REQUIRED REWORK (session manager, per the OWNER DECISION 2026-11-24 in Evidence): commit 46d9617 maps F6
  on an open chart to `switchChartRange` (local <-> galaxy preset). The owner decided F6 on an open chart is a
  no-op (chart stays open, preset and camera unchanged). Rework: drop the preset switch on a repeated F6,
  rewrite FIDELITY row E-184 to record this divergence citing the owner decision 2026-11-24 (Oolite: repeated
  F6 toggles short-/long-range chart), fix the CHANGELOG/README wording, update the unit tests, and make the
  F4 -> F6 -> F6 spec assert the chart is still open with an unchanged preset and camera. Then rerun the
  targeted specs, remote `verify` and remote `e2e-cross`.

## Evidence

- timestamp: 2026-11-24
  checked: knowledge-base.md for F-key / keydown / docked patterns
  found: no knowledge-base file entries match (no knowledge-base.md present)
  implication: no known-pattern candidate

- timestamp: 2026-11-24
  checked: src/input/actions.ts ACTION_CONTEXTS
  found: station screen actions (F3/F4/F5/F8) and saveLoad (F2) are live only in dockHome/dockScreen;
    `chart` (F6) is live in flight/dockHome/dockScreen/chart, not saveScreen. The `chart` context has only
    chart*/pause/chart; the `saveScreen` context has only saveScreen*/pause.
  implication: from the Chart, F2/F3/F4/F5/F8 cannot fire; from Save/Load no F-key fires (not even F2 or F6).

- timestamp: 2026-11-24
  checked: src/input/keyboard.ts keyDown
  found: `contextual.length === 0` returns `RESERVED_F_KEYS.has(code)` -> the key is reported handled, the
    capture guard preventDefaults it, and nothing happens. Station screen actions are applied synchronously
    via `onStationScreen`; chart and save actions are queued and drained in frame-loop.ts.
  implication: an out-of-context F-key is silently swallowed: "does nothing".

- timestamp: 2026-11-24
  checked: src/app/session/chart-controller.ts applyChartAction
  found: `case "chart": if (chartOpen) closeChart(); else openChart();` and closeChart restores
    `contextBeforeChart`.
  implication: F6 on the chart returns to the screen it was opened from (owner's F4 -> F6 -> F6 symptom).

- timestamp: 2026-11-24
  checked: Oolite PlayerEntityControls.m pollDockedControls (4124-4184) and
    pollGuiScreenControlsWithFKeyAlias (3910-4040)
  found: docked, every GUI screen except mission/keyboard-entry/report runs pollGuiScreenControls, so F2,
    F3, F4, F5, F6, F8 work from every screen including the charts and the load/save screen. F6 on the
    short-range chart opens the long-range chart; F6 anywhere else (long-range chart included) opens the
    short-range chart. F5 on Status opens Manifest, otherwise Status. F8 on Market opens Market Info. F2 is
    ignored only on GUI_SCREEN_OPTIONS itself.
  implication: Wegolite's context table diverges: F-keys must be live on the chart and save screens, and
    F6 on the chart switches local <-> galaxy (Wegolite's short-/long-range equivalent), never closes.

- timestamp: 2026-11-24
  checked: live repro by the coordinator in the real dev app (remote GPU Chromium via Playwright MCP,
    http://192.168.178.5:5173/, docked at Lave)
  found: from Home/Market/Outfitting/Interfaces/Status, F2, F3, F4, F5, F6 and F8 each open their screen
    on the first press, also after a mouse click on a tab-strip button (activeElement=SECTION#station-screen,
    keydown preventDefaulted). Held F4 produces only 1 keydown, so autorepeat is not a factor.
  implication: H3 mostly eliminated; the section screens themselves are fine.

- timestamp: 2026-11-24
  checked: same live repro, from the Chart (#chart overlay, z-index 10 over #docked, with its own duplicate
    tab strip)
  found: F2, F3, F4, F5 and F8 do nothing (still on the chart, keydown preventDefaulted). F6 closes the
    chart and returns to the previous screen (Interfaces -> F6 -> F6 => Interfaces; from Home => home).
  implication: confirms H1 (chart part) and H2.

- timestamp: 2026-11-24
  checked: same live repro, from Save/Load (#save-load-screen)
  found: no F-key does anything, F2 and F6 included.
  implication: confirms H1 (save screen part).

- timestamp: 2026-11-24
  checked: same live repro, with focus in #chart-find-input (chart search box)
  found: F8/F6/F5 keydowns are NOT preventDefaulted and nothing fires.
  implication: a third gap: the text-input focus path skips F-key handling. Decision (session manager, on
    the coordinator's recommendation): F-keys still navigate while the search box is focused, because
    F-keys are not text input and Oolite has no text box (no fidelity divergence). The spec must cover it.

- timestamp: 2026-11-24
  checked: coordinator instructions
  found: no need to re-reproduce on the remote before fixing; the browser spec is still required (each
    F-key from each docked screen including Chart, Save/Load and the focused chart search box, plus
    F4 -> F6 -> F6). Owner note: saves in the test browser may be deleted freely ("New game" is fine in
    specs and manual checks).
  implication: skip the scratch-spec repro; proceed to the fix and the repo spec.

- timestamp: 2026-11-24
  checked: OWNER DECISION (2026-11-24), relayed by the coordinator; overrides any plan to map F6 to the
    local/galaxy preset
  found: when the chart is already open, F6 does nothing: the chart stays open, the preset and camera are
    unchanged; it never closes the chart and never returns to the previous screen. Reason: Wegolite has a
    single zoomable chart (wheel zoom, drag, Tab toggles the local/galaxy preset), not two separate chart
    screens, so a repeated F6 has nothing to switch.
  implication: fix = F6 on the open chart is a no-op (not a toggle, not a local <-> galaxy switch). Add a
    FIDELITY.md row recording this divergence from Oolite (Oolite: repeated F6 toggles short-range /
    long-range chart, PlayerEntityControls.m pollGuiScreenControlsWithFKeyAlias), citing the owner decision
    2026-11-24. The F4 -> F6 -> F6 spec must assert the chart is still open with an unchanged preset and
    camera. Everything else stands: F2/F3/F4/F5/F8 work from the Chart and Save/Load screens, and F6 works
    from Save/Load.

- timestamp: 2026-11-24
  checked: fix applied (actions.ts contexts, keyboard.ts routing and text-field rule, station-controller.ts
    navigateByKey, chart-controller.ts switchChartRange, start-session.ts sink wiring)
  found: targeted unit tests green (188 tests in tests/input, station-controller, chart-controller,
    station-tabs); with src/ reverted (git stash) and the new tests kept, 24 of them fail (RED), so the tests
    bite on the fix.
  implication: the unit-level oracle is specified (expected screen per key per context), not implicit.

- timestamp: 2026-11-24
  checked: Oolite pin 7437f22 lines for the FIDELITY rows; contract test with OOLITE_SRC on the pinned tree
  found: pollDockedControls GUI keys are 4157-4165 and the F6 switch is 3921-3940 at the pin; the contract
    test passes verbatim (9/9) with the two new rows (E-183 faithful, E-184 divergence quoting the existing
    chart-camera Key Decision: the way back to local starts at the local preset where Oolite restores its
    saved short-range zoom).
  implication: fidelity is recorded, nothing diverges silently.

- timestamp: 2026-11-24
  checked: rework per the owner decision 2026-11-24 (continuation debugger), on top of 0ba3cd1
  found: `switchChartRange` removed (chart-controller.ts, station-controller.ts deps, game-session.ts wiring;
    rg finds no other user). `navigateByKey("chart")` on an open chart returns at once (station-controller.ts
    :973), in every context incl. flight; `applyChartAction("chart")` opens a closed chart and does nothing on
    an open one. `chartPreset` is written only by toggleChartPreset (Tab) and openChart, so the preset can no
    longer change on F6. The `currentState.mode !== "docked"` comparison is untouched, so the
    dead-mode-gates pin (5) stands. Unit tests rewritten: chart-controller (F6 twice/three times on local,
    galaxy and a panned/zoomed camera: open, preset and camera identical, no view/probe calls, context stays
    `chart`), station-controller (F6 on open chart x3: no calls, preset/camera identical; in flight too).
  implication: F6 on an open chart is a no-op as the owner decided.

- timestamp: 2026-11-24
  checked: targeted unit tests in Docker (chart-controller, station-controller, tests/input, tests/contract);
    RED check with src/ stashed back to 0ba3cd1 and the new tests kept
  found: 225 passed, 1 skipped (fidelity verbatim, no OOLITE_SRC). RED: 4 of the new/changed tests fail on
    the 0ba3cd1 source (2 in chart-controller, 2 in station-controller), so they bite on the preset switch.
    FIDELITY contract with OOLITE_SRC on the pinned tree (git archive 7437f22 src): 9/9 passed, none skipped.
  implication: unit oracle is specified and discriminating; E-184 (rewritten as the owner-decision
    divergence, Wegolite cell station-controller.ts:973) and E-183 (pointer 961 -> 960) hold verbatim.

- timestamp: 2026-11-24
  checked: local Docker gates on the rework, then amended 0ba3cd1 -> 24e112c ("fix(input): docked F-keys work
    on every station screen; F6 keeps an open chart"; not pushed)
  found: full unit suite (`npm run test:fast` in the test container) 288 files, 7563 passed, 10 skipped,
    0 failed, rc=0; typecheck rc=0; lint (eslint + prettier --check .) rc=0.
    Manual mutants at the fix sites (no Stryker in the project): deleting the `navigateByKey` no-op line
    is killed (station-controller test fails: F6 would close and reopen the chart); making
    `applyChartAction("chart")` call openChart unconditionally survives, but it is an equivalent mutant
    (openChart returns early when the chart is open, chart-controller.ts Pitfall 13 guard).
  implication: no regression in the unit suite; the fix site is covered.

- timestamp: 2026-11-24
  checked: remote Chromium (wegolite-remote-run.sh, snapshot 24e112c5): station-fkeys, station-tabs,
    chart-gestures, save-load, station, game-over-guard and hyperspace specs, `--project=chromium`
  found: 56 passed (3.5 min), exit=0, elapsed 213 s. station-fkeys 9/9 incl. "F4 then F6 then F6 keeps the
    chart open with an unchanged preset and camera" and "each docked screen key works on the first press
    from chart". Log: /tmp/claude-1027/-home-opencode-git-wegolite/df5840cd-f17f-4d52-8840-3acb682581b8/scratchpad/remote-e2e-2.log
  implication: the owner's F4 -> F6 -> F6 case and every key from every docked screen pass in Chromium.

- timestamp: 2026-11-24
  checked: remote `verify` (wegolite-remote-run.sh run --rm verify, snapshot 24e112c5)
  found: exit=0, elapsed 209 s. Lint, typecheck and content drift green; unit 288 files, 7563 passed,
    10 skipped; build green; Chromium e2e smoke subset 28 passed (1.3 min).
    Log: /tmp/claude-1027/-home-opencode-git-wegolite/df5840cd-f17f-4d52-8840-3acb682581b8/scratchpad/remote-verify.log
  implication: the fast gate is green on the committed fix.

- timestamp: 2026-11-24
  checked: remote `e2e-cross` (Firefox, headed under xvfb, snapshot 24e112c5)
  found: exit=0, elapsed 79 s, 11 passed (1.3 min): core-loop, engine and all 9 station-fkeys cases incl.
    "F4 then F6 then F6 keeps the chart open with an unchanged preset and camera" and the focused search box.
    Log: /tmp/claude-1027/-home-opencode-git-wegolite/df5840cd-f17f-4d52-8840-3acb682581b8/scratchpad/remote-e2e-cross.log
  implication: the owner's report names both engines; both pass.

- timestamp: 2026-11-24
  checked: Oolite F5/F8 second press (coordinator item 4), checkout 21978c37b and pin 7437f22
  found: F5 on Status opens the Manifest, else Status (pin :3904-3916); F8 on Market opens Market Info, else
    the Market (pin :3955-3967). Wegolite re-opens the same screen (page 1 / Market); Market Info is a hidden
    slot in src/ui/station-tabs.ts.
  implication: recorded as pending todo 2026-11-24-second-f5-f8-press-oolite-subscreens.md, out of scope here.

## Eliminated

- H3 (mostly): Home/section screens do not eat F-keys (focus on tab-strip buttons, autorepeat). Source:
  coordinator live repro above.

## Resolution

- root_cause: three independent code gaps and one wrong toggle (OR-ed, not AND-ed):
  (1) `ACTION_CONTEXTS` (src/input/actions.ts) made F3/F4/F5/F8 and F2 live only in `dockHome`/`dockScreen`
  and F6 not in `saveScreen`, so on the Chart and Save/Load screens the reserved F-key was swallowed and
  nothing fired; (2) `applyChartAction("chart")` (src/app/session/chart-controller.ts) closed an open chart,
  restoring the context under it, so a second F6 returned to the previous screen; (3) `onKeyDown`
  (src/input/keyboard.ts) dropped every key from a text field and `shouldCancelReservedKey` exempted text
  fields, so with the chart's Find planet box focused an F-key did nothing and reached the browser (F5 reload).
- fix: the six docked screen keys are live in the `chart` and `saveScreen` contexts (F2 not on its own
  screen) and, outside `flight`, go through one synchronous sink, `navigateByKey` in station-controller.ts,
  that closes the open overlay and opens the target in press order; F6 on an open chart is a no-op in every
  context (owner decision 2026-11-24): the chart stays open, its preset and camera are unchanged, it never
  closes and never returns to the previous screen (Esc closes it, Tab switches the presets);
  `applyChartAction("chart")` only opens a closed chart; F1-F8 are never text input, so they reach the game
  and are cancelled from a text field. FIDELITY rows E-183 (faithful) and E-184 (divergence: Oolite's
  repeated F6 switches the short-/long-range chart; owner decision 2026-11-24, quoting the chart-camera Key
  Decision), CHANGELOG Fixed entry, README chart prose. The rework removed `switchChartRange` (first
  version, 46d9617) and re-pinned nothing (the dead-mode-gates pin 5 from 0ba3cd1 stands).
- oracle_type: specified (each key from each screen has a stated target screen; F6 on the chart leaves the
  chart open with the same preset and camera; F2 on Save/Load stays) - boundary neighbours: every source screen incl. the two overlays and the
  focused text field, F6 twice and three times, flight and pre-roll contexts.
- verification (fix-acceptance guardrail, on 24e112c):
  target_test: { result: pass } - tests/e2e/station-fkeys.spec.ts 9/9 in remote Chromium and 9/9 in remote
    Firefox; unit navigateByKey/applyChartAction cases green.
  mutation_check: { result: pass (manual), reason: no Stryker in the project; manual mutants at the fix site,
    mutant_killed: true } - deleting the navigateByKey no-op line is killed; making applyChartAction call
    openChart unconditionally survives as an equivalent mutant (openChart returns when the chart is open).
  no_op_deletion: { result: flagged, deletion_justified_by_rca: true } - the rework deletes switchChartRange
    and adds an early return because the owner decided F6 on an open chart is a no-op (Evidence, OWNER
    DECISION 2026-11-24); the original fix (contexts, sink, text-field rule) adds behaviour.
  adjacent_tests: { result: pass, suites_run: [local unit 7563 passed / 10 skipped, typecheck, lint,
    FIDELITY contract verbatim 9/9 with OOLITE_SRC on the pinned tree, remote Chromium station-fkeys +
    station-tabs + chart-gestures + save-load + station + game-over-guard + hyperspace 56 passed, remote verify
    exit 0 (unit 7563 passed / 10 skipped, e2e smoke 28 passed), remote e2e-cross 11 passed] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true } - first
    debugger: src/ reverted, 24 new tests fail; rework: src/ back to 0ba3cd1 (preset switch), 4 rework tests
    fail; reapplied, all green.
  guardrail_verdict: accepted
- files_changed: src/input/actions.ts, src/input/keyboard.ts, src/app/session/station-controller.ts,
  src/app/session/chart-controller.ts, src/app/session/start-session.ts, src/app/game-session.ts,
  playwright.config.ts, tests/e2e/station-fkeys.spec.ts, tests/input/bindings.test.ts,
  tests/input/station-actions.test.ts, tests/app/session/station-controller.test.ts,
  tests/app/session/chart-controller.test.ts, tests/guards/dead-mode-gates.test.ts, src/app/session/frame-loop.ts
  (comment), FIDELITY.md, CHANGELOG.md, README.md
