---
phase: quick
plan: 261125-ewd
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/session/station-controller.ts
  - src/app/session/start-session.ts
  - src/app/game-session.ts
  - src/ui/station.ts
  - src/ui/station-hints.ts
  - index.html
  - tests/app/session/station-controller.test.ts
  - tests/ui/station-hints.test.ts
  - tests/e2e/station-fkeys.spec.ts
  - FIDELITY.md
  - CHANGELOG.md
  - README.md
autonomous: true
requirements: [ECON-04, ECON-09]

estimate:
  tokens: 120000
  raw_tokens: 120000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "O1: Docked on the Market list, a left click on a row the keys can select moves the selection there exactly as Up/Down would land on it: `tr.selected` and the probe `station.selectedKey` follow, the comment line under the list follows (Slaves shows its note), and an open `[Y/N]` line and a notice clear; a click on the already-selected row changes nothing and renders nothing; a click on a row the keys cannot select (Alien Items with no stock and none held) changes nothing"
    - "O2: A double click on a selectable row selects it and opens the `[Y/N]` line of the trade Oolite's Enter makes there (`PlayerEntityControls.m:2864-2890` at 7437f22): with Shift the buy-max plan, otherwise the sell-all plan when the hold carries some, otherwise the buy-max plan, each refused plan falling through to the next; when every plan is refused, the buy refusal notice; a double click never changes credits, cargo, the market, lastTrade or the profile object, never autosaves, and Y or Enter then completes exactly that plan through the unchanged confirmTrade"
    - "O2: A double click on a row the keys cannot select does nothing: the previous selection, an open `[Y/N]` line and a notice stay (Oolite's `clearMouse`, `PlayerEntityControls.m:759-763`)"
    - "O3: Selectable rows (including a dimmed zero-stock row the hold carries) show a pointer cursor and no text selection on double click; rows the keys cannot select do not show a pointer; rows stay non-focusable `tr` elements (T-05-25)"
    - "O4: Clicks and double clicks do nothing unless docked on the visible Market with no chart, no Save/Load screen and no overwrite question open, not paused, context not lost, not game over, not disposed and not in the launch pre-roll; only a `data-key` that names a row of the current selectable keys reaches the selection (unknown, empty and prototype keys ignored)"
    - "O5: A key pressed before a click in the same frame applies first (the click handler runs `flushQueuedEdges` before the controller, as the synchronous F-key sink does), and a key pressed after a click acts on the clicked row"
    - "O6/O7: The market footer reads `Up/Down/Click select · Double-click sell all/buy max · Left sells +1 · Right buys +1 · Shift max · Enter/Y confirm · N cancel · Esc back · P pause` with default bindings, on every page; key bindings are unchanged; at 1280x720 the hints line is not ellipsised (scrollWidth <= clientWidth) in Chromium and Firefox"
    - "O8: FIDELITY.md has a faithful click row (E-191, `PlayerEntityControls.m:744-763`), a faithful double-click row (E-192, `PlayerEntityControls.m:2864-2883`) that names the `[Y/N]` step and Phase 5 D-06, and a hint divergence row quoting the footer-legend Key Decisions row; both excerpts verbatim at 7437f22; the contract test passes with and without OOLITE_SRC; no new PROJECT.md Key Decisions row; CHANGELOG [Unreleased] has the Added and Changed entries; README names the mouse on the market"
    - "Gates: local test, lint, typecheck green; tests/guards/dead-mode-gates.test.ts still pins 5 for src/app/session/station-controller.ts; remote Chromium station-fkeys, station and station-tabs, remote verify and remote e2e-cross green on the committed HEAD"
  artifacts:
    - path: src/app/session/station-controller.ts
      provides: "selectMarketRow(key) and activateMarketRow(key, shift) behind one guard helper; moveSelection and the click share one landing helper; the double click commits a plan the way planMax does"
      contains: "function activateMarketRow"
    - path: src/ui/station.ts
      provides: "delegated click and dblclick listeners on the market tbody passing only data-key (and shiftKey for dblclick); the selectable class on rows"
      contains: "dblclick"
    - path: src/app/session/start-session.ts
      provides: "wires onMarketRowClick and onMarketRowDoubleClick to flushQueuedEdges then the controller"
      contains: "onMarketRowDoubleClick"
    - path: index.html
      provides: "pointer cursor on selectable market rows, no text selection on market rows"
      contains: "tr.selectable"
    - path: src/ui/station-hints.ts
      provides: "the market hint with the mouse parts and Left before Right"
      contains: "Double-click sell all/buy max"
    - path: tests/e2e/station-fkeys.spec.ts
      provides: "the two mouse cases (click, double click), also run by Firefox in e2e-cross"
      contains: "dblclick"
    - path: FIDELITY.md
      provides: "three rows and excerpts E-191, E-192"
      contains: "### E-192 src/Core/Entities/PlayerEntityControls.m:2864-2883"
  key_links:
    - from: src/ui/station.ts
      to: src/app/session/start-session.ts
      via: "StationShell.onMarketRowClick / onMarketRowDoubleClick handlers registered in startSession next to onMarketSort"
      pattern: "onMarketRow(Double)?Click"
    - from: src/app/session/start-session.ts
      to: src/app/session/station-controller.ts
      via: "flushQueuedEdges() then selectMarketRow(key) / activateMarketRow(key, shift), passed through game-session.ts like sortMarket"
      pattern: "(selectMarketRow|activateMarketRow)\\("
    - from: src/app/session/station-controller.ts
      to: src/sim/economy/trade.ts
      via: "planFor(side, Number.MAX_SAFE_INTEGER) for the double-click chain; confirmTrade is the only apply path"
      pattern: "planFor\\("
    - from: FIDELITY.md
      to: .planning/PROJECT.md
      via: "the hint divergence row quotes the footer-legend decision text as its first double-quoted string"
      pattern: "Unify the docked, chart and Save/Load footer on one two-line template with live key labels"
---

<objective>
Mouse on the docked Market (F8) list, faithful to Oolite, plus two owner additions to the market footer hint.

Owner decisions 2026-11-25 (locked; cited as O1-O9):
- O1 Single left click on a market row selects it exactly as Up/Down would land on it: same selection rules
  (`isMarketRowSelectable`; a row the keys cannot select is ignored) and the same side effects as `moveSelection`
  (pending `[Y/N]` line and notice cleared, comment line follows). Oolite: the `mouse_click` branch of
  `handleGUIUpDownArrowKeys`.
- O2 Double click on a market row: select it, then Wegolite's equivalent of Oolite's market Enter/double-click
  (`pollMarketScreenControls`): Shift held -> buy max; else a held good -> sell all; else -> buy max, through the
  existing max-plan path, which only opens the `[Y/N]` line or shows the refusal notice. A double click must NEVER
  complete a trade. Wegolite's Enter (`stationConfirm`) only confirms a pending trade; the double click is not mapped
  to it.
- O3 Pointer cursor on selectable market rows only.
- O4 Guards: nothing unless the Market is the visible docked screen with no overlay (chart, Save/Load screen,
  overwrite question), not paused, context not lost, not game over, docked, not launching. One delegated listener on
  the market tbody per event, passing only the row's `data-key`, re-validated in the session (allow-list, like
  `sortMarket`).
- O5 Do not break the keyboard flow or the queued/synchronous input ordering of quick 261124-pze; route the click
  like the market sort click.
- O6 (owner addition) The market footer hint names the mouse, short and in the existing style, and still fits at
  1280x720; the browser spec asserts the footer hint line does not overflow.
- O7 (owner addition) Swap the market hint text order to Left first, then Right (text order only; bindings
  unchanged); update every assertion that pins the old string.
- O8 Records: FIDELITY rows (faithful click and double click with excerpts from 7437f22; the hint noted as a
  divergence Oolite does not have), CHANGELOG `[Unreleased]`, no new Key Decision for the `[Y/N]` step.
- O9 Tests: unit and browser as listed in the tasks; gates `test`, `lint`, `typecheck` locally, browser specs,
  `verify` and `e2e-cross` on the remote machine.

Findings from planning (so the executor does not re-derive them):
- Oolite at 7437f22 (checked with `git -C /home/opencode/git/oolite show 7437f22:src/Core/Entities/PlayerEntityControls.m`;
  the checkout HEAD has extra joystick lines, so its numbers differ): `handleGUIUpDownArrowKeys` is lines 697-770,
  the click branch 743-752, the double-click selection 753-765 with `[gameView clearMouse]` at 763 for an
  unselectable row; `pollMarketScreenControls` is 2706-2897, the Enter/double-click block 2849-2893, the trade chain
  2864-2890. Excerpts are at most 20 lines (contract test), so E-191 is 744-763 (both selection branches and
  `clearMouse`) and E-192 is 2864-2883 (the Shift buy, sell-all and buy-max branches).
- Oolite's chain is an `else if` fall-through on success: Shift and buy-all succeeds, else held > 0 and sell-all
  succeeds, else buy-all succeeds, else the can't-buy sound. A refused attempt falls to the next. Wegolite plans
  instead of trading: `planFor(side, Number.MAX_SAFE_INTEGER)` in that order; the first `ok` plan becomes
  `stationPending` exactly as `planMax` stores it (`{ ...plan, clamp: undefined }`, notice cleared); if none is
  `ok`, `stationPending` is null and the notice is `tradeNoticeText` of the last (buy) plan. When the first attempt
  succeeds this is the owner's three-way rule; the fall-through only shows when it is refused (Shift with no cash,
  room or stock while some is held gives the sell-all line; a held good whose market row is full at `MARKET_LIMIT`
  gives the buy-max line, because `planSell` refuses with `marketFull`).
- The sort click path: `src/ui/station.ts` `onMarketSort` puts one delegated listener on the thead; `startSession`
  registers `docked.onMarketSort?.((column) => { sortMarket(column); })` (start-session.ts:902-906); `sortMarket`
  is applied directly, not queued, and repeats its guards (station-controller.ts:1058-1073). The row clicks follow
  that shape and add one call: `flushQueuedEdges()` before the controller, as `keyboard.ts` does before the
  synchronous F-key sink (keyboard.ts:256-268, quick 261124-pze). Without it, Right pressed just before a click in
  the same frame would apply after the click, to the clicked row. `sortMarket` itself is not changed.
- `renderMarketRows` rebuilds every row with `replaceChildren` (station.ts:288-314), so both listeners go on the
  persistent tbody (`marketBody`, `[data-market-rows]`). A double click's first click re-renders; the second click
  and the dblclick land on the new row of the same key, and the browser's click count is time and position based,
  so dblclick still fires; the browser case proves it in Chromium and Firefox.
- A click on the already-selected row is a no-op (no state change, no render): Oolite's `setSelectedRow` on the
  selected row changes nothing, and it keeps a fast triple click from cancelling the line a double click opened.
- `MarketRow.selectable` already exists (station-model.ts:318, from `isMarketRowSelectable`) but is not rendered.
  `dimmed` (`!tradeable || stock <= 0`) is not the same: a held zero-stock good is dimmed but selectable. The cursor
  uses `selectable`.
- `tests/guards/dead-mode-gates.test.ts` pins 5 negative FlightMode comparisons in
  `src/app/session/station-controller.ts`. Write the docked test positively (`ctx.core.state?.mode === "docked"`);
  the pin must stay 5.
- Vitest runs only the `node` environment, so the shell listeners are proved by the browser cases.
  `tests/e2e/station-fkeys.spec.ts` is in the Firefox project's `testMatch` (playwright.config.ts:52), so mouse cases
  there run in `e2e-cross` with no config change.
- Hint width: the hints line is 12.75 px monospace (`15px` x `0.85em`) with 2rem side padding, about 1216 px usable
  at 1280. The current market line is 108 characters; the planned line is 146 (about 1121 px in DejaVu Sans Mono). A
  separate `Click select` part would make it 155 (about 1190 px), too tight, hence `Up/Down/Click select`.
- Records: no FIDELITY row and no PROJECT.md Key Decisions row records the market `[Y/N]` trade confirmation; it is
  Phase 5 D-06 (`.planning/milestones/v1.0-phases/05-docked-economy-station-screens/05-CONTEXT.md:31`). Per the
  owner's instruction no Key Decision is added: the double-click row is `faithful` for the trade choice and its
  Mechanic cell names the `[Y/N]` step and D-06. The F5 hint decision (PROJECT.md row starting `A second F5 press
  opens Oolite's Manifest`) covers only the F5 hint; the mouse hint row quotes the footer-legend decision
  `Unify the docked, chart and Save/Load footer on one two-line template with live key labels` (PROJECT.md:215).
  Both points are flagged to the orchestrator; if the owner wants a dedicated Key Decisions row instead, only the
  two FIDELITY cells and one PROJECT.md row change.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/quick/261124-ou6-replace-the-market-info-page-with-a-desc/261124-ou6-SUMMARY.md

Reviewer and subagent brief (binding, verbatim from the orchestrator):
- Tests and builds run in Docker only. Host Node/npm/Playwright are not authoritative.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>`, `docker compose run --rm typecheck`, `docker compose run --rm lint`; browser via the remote wrapper above.
- Scratch files under /tmp mounted into the container, never in the repo.
- Use codebase-memory MCP (project `wegolite`, Oolite as `oolite`) when available; prefer `rg` over grep.
- All committed text in English.

Project rules for this plan (from AGENTS.md and the orchestrator, binding):
- The remote wrapper is `/home/opencode/.claude/scripts/wegolite-remote-run.sh <compose args>`. It syncs the
  COMMITTED HEAD: commit before every remote run, run it in the foreground with a long timeout. Browser specs,
  `verify` and `e2e-cross` run only there.
- Do not run `lint` at the same time as `test` (261124-ou6 saw an unrelated timeout from that).
- `lint` runs `prettier --check .`: format every touched file with
  `docker compose run --rm test npx prettier --write <files>` before committing.
- Do not hand-edit or regenerate `src/content/generated/`, and do not touch `third_party/`.
- The Oolite checkout `/home/opencode/git/oolite` is read-only; FIDELITY excerpts are verbatim from
  `git -C /home/opencode/git/oolite show 7437f22:<path>`.
- FIDELITY divergence rows: the FIRST double-quoted string in the Fidelity cell must be a substring of
  `.planning/PROJECT.md`; every other literal in backticks. A faithful row's Fidelity cell is exactly `faithful`.
  No pipes inside cells.
- CHANGELOG `[Unreleased]` entries land in the same commit as the change; released sections stay untouched.
- Commit subjects use the tag `quick-261125-ewd`. Do NOT push. No `test:acceptance` run is needed (nothing under
  `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` changes).
</context>

<tasks>

<task type="tracer">
  <name>Task 1: End-to-end "a click on a market row selects it" — controller, shell listener, session wiring with the queued-edge flush, cursor, one browser case</name>
  <files>src/app/session/station-controller.ts, src/app/session/start-session.ts, src/app/game-session.ts, src/ui/station.ts, index.html, tests/app/session/station-controller.test.ts, tests/e2e/station-fkeys.spec.ts, CHANGELOG.md</files>
  <precondition>The remote test machine answers through /home/opencode/.claude/scripts/wegolite-remote-run.sh (needed for the browser verify after the commit).</precondition>
  <read_first>
    - src/app/session/station-controller.ts:138-207 (isSelectableGood, orderedGoods, ensureSelection, selectableKeys, moveSelection), :375-392 (planMax), :895-905 and :972-987 (the guards of navigateStation and navigateByKey), :1050-1073 (sortMarket), :1153-1191 (the returned surface)
    - src/ui/station.ts:1-70 (module doc, StationShell with onMarketSort), :158-162 (marketBody), :288-314 (renderMarketRows), :400-416 (onMarketSort's delegated listener and the AbortController signal)
    - src/app/session/start-session.ts:150-163 (the deps interface: flushQueuedEdges, sortMarket), :360-372 (deps destructuring), :770-778 (setQueuedEdgeFlush), :900-906 (the onMarketSort registration)
    - src/app/game-session.ts:318-331 and :560-580 (how sortMarket is taken from the controller and passed on)
    - src/input/keyboard.ts:20-40 and :250-285 (the order rule and the flush before the synchronous sink); src/app/session/frame-loop.ts:230-275 (createQueuedEdgeFlush)
    - index.html:303-345 (selected, sortable heading cursor and user-select, dimmed) and :400-445 (market-only rules)
    - tests/app/session/station-controller.test.ts:20-113 (harness), :191-205 (selection), :352-380 (navHarness), :470-497 (the isConfirming stub), :713-839 (the sortMarket describe, its guard test is the pattern)
    - tests/guards/dead-mode-gates.test.ts:1-30 and the PINNED entry for station-controller.ts (5)
    - tests/e2e/station-fkeys.spec.ts:1-30 (header), :95-218 (collectErrors, boot, pressInOneFrame, waitForPlace, settleFrames), :290-310 (expectNoReload), :556-662 (the market comment case: Lave order food, textiles, radioactives, slaves; the Slaves note text)
  </read_first>
  <behavior>
    - selectMarketRow(key of another selectable row) sets stationSelection to it, sets stationPending to null and stationNotice to "", and renders once; the last view's market.selectedKey is the key and market.commentText follows it (slaves gives its note)
    - with a pending buy line (stepAmount(1)) and stationNotice "stale", a click on another selectable row clears both
    - a click on the row already selected leaves stationPending (same object) and stationNotice unchanged and renders nothing
    - a click on a key that is not selectable (a good of the market with isSelectableGood false, found from the harness market and asserted to exist), on "", "not_a_good" and "__proto__" changes nothing and renders nothing
    - a zero-stock row the hold carries (cargo set on the profile, stock set to 0 on a market copy) is selectable by click, as by keys
    - every guard case changes nothing and renders nothing: paused, contextLost, disposed, gameOver, chartOpen, saveScreenOpen, saveLoad.isConfirming() true (stub as in the navigateByKey test), stationScreen "status", mode "inFlight", preRoll.preRolling true
    - with the sort active (marketSort name ascending) a click selects by key, and moveSelection(1) then moves from the clicked row in the sorted order
    - moveSelection keeps its existing behaviour (the "selection" describe passes unchanged)
  </behavior>
  <action>
Controller (O1, O4). In `src/app/session/station-controller.ts` add a private guard helper (for example
`marketMouseAllowed`) that returns true only when the session is not disposed, context not lost, not paused, not
game over, `ctx.core.state?.mode === "docked"` (positive comparison: the dead-mode-gates pin stays 5), the launch
pre-roll is not running (`launchSequence.preRolling`), the station screen is `market`, neither the chart nor the
Save/Load screen is open, and `ctx.save.saveLoad?.isConfirming()` is not true. Extract the landing step of
`moveSelection` (set `stationSelection`, clear `stationPending` and `stationNotice`) into one private helper and
call it from `moveSelection`, so keys and clicks cannot drift apart. Add `selectMarketRow(key: string): void`: return
unless the guard passes; return unless `selectableKeys()` includes `key` (this is the allow-list: only a current,
selectable market row, in any sort order); return when `key` already equals `stationSelection` (no state change, no
render: Oolite's `setSelectedRow` on the selected row changes nothing); otherwise land on it and `renderStation()`.
Doc comment: the F8 row-click sink (owner decision 2026-11-25, quick 261125-ewd, FIDELITY E-191), Oolite's
`mouse_click` branch of `handleGUIUpDownArrowKeys` (`PlayerEntityControls.m:743-752` at 7437f22); it repeats the
guards because a DOM click is not a trust boundary, like `sortMarket`. Export it from the returned surface.

Shell (O3, O4). In `src/ui/station.ts` add the optional `onMarketRowClick?(handler: (key: string) => void): void`
to `StationShell` and implement it as one delegated `click` listener on `marketBody` with the shell's
`controller.signal`: ignore a non-primary button (`event.button !== 0`), find `closest("tr[data-key]")` from an
Element target, require the row to be inside `marketBody`, read `dataset.key`, ignore undefined or empty, and pass
only the key. In `renderMarketRows` add the class `selectable` when `row.selectable` is true. Rows stay plain
non-focusable `tr` elements (no tabindex, no role, T-05-25). Extend the module doc: market rows take a click (and,
after Task 2, a double click) through one delegated listener each; the session re-validates the key.

CSS (O3). In `index.html`, next to the sortable-heading rules, add `#docked [data-station-panel="market"]
[data-market-rows] tr { user-select: none; }` and `#docked [data-station-panel="market"] [data-market-rows]
tr.selectable { cursor: pointer; }`, with a short comment (quick 261125-ewd: a click selects a row the keys can
select; no text selection on a double click). No colour, font or spacing change.

Session wiring (O5). Add `selectMarketRow` to the start-session deps interface (next to `sortMarket`, with a doc
line), take it from the controller in `src/app/game-session.ts` and pass it on exactly like `sortMarket`. In
`startSession`, right after the `onMarketSort` registration, register `docked.onMarketRowClick?.((key) => { ... })`
whose body calls `flushQueuedEdges()` and then `selectMarketRow(key)`, with a comment: like the sort click the click
is applied directly and the controller repeats its guards; the flush first applies the screen edges queued earlier
in the same frame, the key-order rule of quick 261124-pze, so Right then a click plans on the old row and the click
then clears it. Do not change `sortMarket` or the keyboard layer.

Unit tests. In `tests/app/session/station-controller.test.ts` add a describe "market row click (quick 261125-ewd)"
with the cases of the behaviour list, using `harness()` (market screen, Lave market) and the isConfirming stub
shape of the navigateByKey test. Assert renders through `h.views` and `h.calls`.

Browser (tracer end-to-end). In `tests/e2e/station-fkeys.spec.ts` add one sentence to the header (the two market
mouse cases of quick 261125-ewd live here so the Firefox project runs them too) and one test, "a click on a market
row selects it as Up and Down do, and a click on a row the keys cannot select does nothing", at a 1280x720
viewport: boot; F8; wait for market page 1 with `selectedKey` `food`. Row locator helper:
`#docked [data-market-rows] tr[data-key="<key>"]`. Click `slaves`: wait for `selectedKey` `slaves`, the
`tr.selected` row has `data-key` `slaves`, the comment line `#docked [data-field="market-comment"]` has the Slaves
note text the existing comment case uses. The computed `cursor` of the slaves row is `pointer` and of the
`alien_items` row is not `pointer`. Click `alien_items` (it has the `dimmed` class), `settleFrames`: `selectedKey`
is still `slaves` and the comment is unchanged. Order: with `page.evaluate`, in ONE task, dispatch an `ArrowRight`
keydown and keyup on window (as `pressInOneFrame` does) and then a bubbling primary `click` MouseEvent (detail 1)
on the first cell of the `textiles` row; `settleFrames`; the probe shows `selectedKey` `textiles` and
`station.pending` null. Then in one task dispatch the click on `radioactives` first and the `ArrowRight` press
after it; `settleFrames`; `selectedKey` `radioactives` and `station.pending` is `{ kind: "trade", key:
"radioactives" }`; press `KeyN` and wait for `pending` null. Overlay guard: press F6, wait for the chart, dispatch a
click on the `food` row's first cell through `page.evaluate`, `settleFrames`, `selectedKey` is still `radioactives`;
Escape and wait for the market. End with `expectNoReload` and no console errors.

CHANGELOG (same commit). Under `## [Unreleased]` create `### Added` with: on the market, a click on a commodity
selects it, as Up and Down do; commodities the keys cannot select ignore the click (Task 2 extends this entry).

Format the touched files with prettier, run the local checks below, commit (tag `quick-261125-ewd`), then run the
remote Chromium spec.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/app/session/station-controller.test.ts tests/guards/dead-mode-gates.test.ts tests/app/session/queued-edge-flush.test.ts && docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>rg -c 'function selectMarketRow' src/app/session/station-controller.ts [HEAD=0 EXPECT==1]; rg -l 'onMarketRowClick' src | wc -l [HEAD=0 EXPECT==2]; rg -c 'tr\.selectable' index.html [HEAD=0 EXPECT==1]; git diff --quiet HEAD -- third_party src/content/generated (exit 0)</automated>
    <automated>After the commit: /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/station-fkeys.spec.ts --project=chromium"</automated>
  </verify>
  <done>In Chromium a click on a selectable market row moves the selection and the comment line, a click on Alien Items and a click under an open chart do nothing, and a key pressed before a click in the same frame applies first. Controller unit tests (selection, guards, allow-list, no-op on the selected row), dead-mode-gates (still 5), typecheck and lint pass. The CHANGELOG entry is in the same commit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Double click plans Oolite's Enter trade behind the [Y/N] line; the market hint names the mouse and lists Left before Right</name>
  <files>src/app/session/station-controller.ts, src/app/session/start-session.ts, src/app/game-session.ts, src/ui/station.ts, src/ui/station-hints.ts, tests/app/session/station-controller.test.ts, tests/ui/station-hints.test.ts, tests/e2e/station-fkeys.spec.ts, CHANGELOG.md</files>
  <read_first>
    - src/app/session/station-controller.ts:300-392 (commodityFor, pendingPlan, tradeRequest, planFor, planMax) and :394-419 (confirmTrade, unchanged)
    - src/sim/economy/trade.ts:233-290 (planSell: with some held it refuses only with marketFull) and the MARKET_LIMIT import
    - git -C /home/opencode/git/oolite show 7437f22:src/Core/Entities/PlayerEntityControls.m, lines 743-765 and 2849-2893
    - src/ui/station-hints.ts:1-80 (module doc, dockedHints market branch)
    - tests/ui/station-hints.test.ts (whole file: the two market pins, the any-page loop, the rebind test's W/Down line)
    - tests/app/session/station-controller.test.ts:207-282 (the refused-trade and accepted-buy patterns: profile identity, profiles, autosave calls)
  </read_first>
  <behavior>
    - activateMarketRow(food, false) with none held: stationPending is the buy plan planMax("buy") would store (side buy, key food, clamp undefined), the confirm text starts with "Buy", notice ""
    - with 3 food held: activateMarketRow(food, false) gives a sell plan for 3 (side sell); activateMarketRow(food, true) gives a buy plan
    - from another selection, activateMarketRow(key) also moves stationSelection to key; a pending line and a notice of the previous row are replaced
    - fall-through: Shift with credits 0 and food held gives the sell plan; food held with its market stock set to MARKET_LIMIT and no Shift gives the buy plan; credits 0 and none held gives stationPending null and the "Not enough credits" notice
    - in every case above ctx.core.profile and ctx.core.market are the same objects as before, lastTrade stays null, profiles stays empty and calls has no "autosave"; then confirmTrade() applies exactly the pending plan (cargo and credits change by its amount and cost)
    - activateMarketRow on a non-selectable key, "", "not_a_good" or "__proto__" leaves the selection, a pending line (same object) and a notice unchanged and renders nothing
    - every guard case of Task 1 also blocks activateMarketRow
    - dockedHints(defaults, "market") equals "Up/Down/Click select · Double-click sell all/buy max · Left sells +1 · Right buys +1 · Shift max · Enter/Y confirm · N cancel · Esc back · P pause", for page 1, page 2 and no page
    - after rebinding stationUp to KeyW the market line contains "W/Down/Click select"; after the rebinds of the rebind test it still contains "Double-click sell all/buy max"
  </behavior>
  <action>
Controller (O2, O4). In `src/app/session/station-controller.ts` extract the commit step of `planMax` (an `ok` plan
becomes `stationPending` with `clamp: undefined` and an empty notice; a refused plan clears `stationPending` and
sets the notice from `tradeNoticeText`) into one private helper that `planMax` keeps using, so the double click
stores exactly what Shift with Right or Left stores. Add `activateMarketRow(key: string, shift: boolean): void`:
return unless the Task 1 guard passes; return unless `selectableKeys()` includes `key` (a double click on a row the
keys cannot select does nothing and never acts on the previous selection, Oolite's `clearMouse`); land on `key` when
it is not already selected (the Task 1 landing helper); then try `planFor(side, Number.MAX_SAFE_INTEGER)` for the
sides in Oolite's order (buy when `shift`, then sell when `ctx.core.profile.cargo[key]` is above 0, then buy) and
commit the first `ok` plan; when none is `ok`, commit the last refused buy plan (its notice); render once. If
`planFor` returns undefined (no market or commodity), render and return. Never call `confirmTrade`, `applyBuy`,
`applySell`, `commitProfile` or `autosave` here, and do not route through `stationConfirm`. Doc comment: the F8 row
double-click sink (owner decision 2026-11-25, quick 261125-ewd, FIDELITY E-192), Oolite's Enter and double click on
the Market (`PlayerEntityControls.m:2849-2890` at 7437f22) with its fall-through; Wegolite plans the trade and opens
the `[Y/N]` line (Phase 5 D-06) instead of trading. Export it.

Shell. In `src/ui/station.ts` add the optional `onMarketRowDoubleClick?(handler: (key: string, shift: boolean) =>
void): void` and implement it as one delegated `dblclick` listener on `marketBody` with the same row and key rules
as the click listener (a shared private resolver for the event target is fine), passing the key and
`event.shiftKey`.

Session wiring. Add `activateMarketRow` to the start-session deps interface and pass it from `game-session.ts` like
`selectMarketRow`. Register `docked.onMarketRowDoubleClick?.((key, shift) => { ... })` after the click registration:
`flushQueuedEdges()` then `activateMarketRow(key, shift)`, with a one-line comment.

Hint (O6, O7). In `src/ui/station-hints.ts` change the market line to: the select part becomes the up/down pair
label followed by `/Click select`; then a literal `Double-click sell all/buy max` part; then the `stationLeft` part
(`sells +1`) before the `stationRight` part (`buys +1`); the rest unchanged. Extend the module doc: the mouse parts
are literal like `Shift max`, because the mouse is not bindable; the market line lists Left before Right in the
keys' left-to-right order (owner request 2026-11-25); Oolite's market shows no legend (FIDELITY row of quick
261125-ewd). In `tests/ui/station-hints.test.ts` update both market pins and the `market` constant to the string of
the behaviour list, reword the comment above that constant (the market line is the same on every page and has no
F8 part), change the rebind expectation `W/Down select` to `W/Down/Click select`, and add an expectation that the
rebound market line still contains `Double-click sell all/buy max`.

Unit tests (TDD: write them first, see them fail, then implement). In `tests/app/session/station-controller.test.ts`
add a describe "market row double click (quick 261125-ewd)" with the cases of the behaviour list; build modified
profiles and markets as copies (the harness market is shared data), import `MARKET_LIMIT` from
`src/sim/economy/market.js`, and compare the stored plan with the one `planMax` stores from the same state in a
second harness.

Browser (O2, O6). In `tests/e2e/station-fkeys.spec.ts` add the test "a double click on a market row opens the
[Y/N] line of Oolite's Enter trade and the footer names the mouse at 1280x720": viewport 1280x720; boot; F8; wait for
`food`. The hints line `#docked [data-footer-role="hints"]` has exactly the market string of the behaviour list, and
its `scrollWidth` is at most its `clientWidth`. Status line `#docked [data-footer-role="status"]`. Read the credits
from the probe (`economy.credits`). `dblclick` the `food` row: wait for `station.pending` `{ kind: "trade", key:
"food" }`; the status matches `^Buy \d+ t Food for .+\? \[Y/N\]$`; credits unchanged and `economy.cargo` empty;
press `KeyN`, wait for `pending` null. Buy one tonne with the keys (`ArrowRight`, `KeyY`) and wait for
`economy.cargo.food` 1; record the credits. `dblclick` `food`: the status matches `^Sell 1 t Food for .+\?
\[Y/N\]$`, credits and cargo unchanged; `KeyN`. `dblclick` `food` with `modifiers: ["Shift"]`: the status matches
`^Buy \d+ t Food`; `KeyN`. `dblclick` `slaves`: `selectedKey` `slaves` and the status matches `^Buy \d+ t Slaves`;
`KeyN`. `dblclick` `alien_items`, `settleFrames`: `selectedKey` still `slaves`, `pending` null, the status has no
`[Y/N]`. Credits and cargo after the last step equal the recorded values. End with `expectNoReload` and no console
errors.

CHANGELOG (same commit). Rewrite the Task 1 `### Added` entry to: on the market, a click on a commodity selects it,
as Up and Down do, and a double click opens the buy or sell confirmation for the trade Oolite's Enter makes there:
with Shift the most you can buy, otherwise all you carry of it, otherwise the most you can buy; nothing is bought or
sold until you confirm with Y or Enter; commodities the keys cannot select ignore the mouse; the footer names both.
Add `### Changed` under `[Unreleased]`: the market footer lists Left sells +1 before Right buys +1, in the order of
the keys; the keys are unchanged.

Format with prettier, run the checks below, commit (tag `quick-261125-ewd`), then run the remote Chromium spec.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/app/session/station-controller.test.ts tests/ui/station-hints.test.ts tests/guards/dead-mode-gates.test.ts && docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>rg -c 'function activateMarketRow' src/app/session/station-controller.ts [HEAD=0 EXPECT==1]; rg -c '"dblclick"' src/ui/station.ts [HEAD=0 EXPECT==1]; rg -c '"Double-click sell all/buy max"' src/ui/station-hints.ts [HEAD=0 EXPECT==1]; rg -n 'Right buys \+1 · Left sells \+1' src tests | wc -l [HEAD=2 EXPECT==0]; rg -c 'Left sells \+1 · Right buys \+1' tests/ui/station-hints.test.ts [HEAD=0 EXPECT>=2]; rg -c '### Changed' CHANGELOG.md [HEAD=8 EXPECT==9]; git diff --quiet HEAD -- third_party src/content/generated (exit 0)</automated>
    <automated>After the commit: /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/station-fkeys.spec.ts --project=chromium"</automated>
  </verify>
  <done>In Chromium a double click opens the [Y/N] line of Oolite's Enter trade (buy max, sell all when held, buy max with Shift) without changing credits or cargo, does nothing on Alien Items, and the market hint (mouse parts, Left before Right) fits at 1280x720 without an ellipsis. Unit tests cover the chain, its fall-through, the no-trade invariant, the allow-list and the guards; the hint pins and the rebind test are updated; dead-mode-gates still 5; CHANGELOG Added and Changed in the same commit.</done>
</task>

<task type="auto">
  <name>Task 3: Records (FIDELITY rows and excerpts, README) and every gate</name>
  <files>FIDELITY.md, README.md, CHANGELOG.md</files>
  <precondition>The remote test machine answers through /home/opencode/.claude/scripts/wegolite-remote-run.sh.</precondition>
  <read_first>
    - FIDELITY.md:13-16 (table header), :213-222 (the last rows, E-183 to the F5 footer divergence row), :3120-3169 (the last excerpts E-188 to E-190 and `## Constants ledger`)
    - tests/contract/fidelity.test.ts:1-32 and :186-307 (the row, excerpt, 20-line and quote rules; OOLITE_SRC)
    - .planning/PROJECT.md:215 (the footer-legend decision quoted by the hint row) and :349 (the F5 hint decision, not reused)
    - README.md:86-110 (Docked station table and the paragraph below it)
    - CHANGELOG.md:1-12
  </read_first>
  <action>
FIDELITY.md (O8). Append three Mechanics rows after the F5 footer divergence row (the last row before `##
Excerpts`), each Mechanic ending with `(quick 261125-ewd)`; find every Wegolite line with `rg -n`.
1. Mechanic: a click on a market row selects it as Up and Down do: a row the keys cannot select (not traded here,
   or no stock and none held) ignores the click, a new selection clears an open `[Y/N]` line and a notice and moves
   the comment line, and a click on the selected row changes nothing; Oolite also ignores the click while Up or Down
   is held, and Wegolite's station keys are edges with no held state. Wegolite: the line of `function
   selectMarketRow(` in `src/app/session/station-controller.ts`. Oolite:
   `src/Core/Entities/PlayerEntityControls.m:744-763`. Fidelity: `faithful`. Excerpt: E-191.
2. Mechanic: a double click on a market row selects it and plans the trade Oolite's Enter makes on the Market: with
   Shift the most it can buy, otherwise all of it when the hold carries some, otherwise the most it can buy, a refused
   plan falling through to the next as Oolite's `else if` chain does, and the buy refusal shown when every plan is
   refused; on a row the keys cannot select it does nothing and never acts on the previous selection (E-191,
   `clearMouse`); the plan opens the same `[Y/N]` line as Shift with Right or Left (Phase 5 D-06), so nothing is
   bought or sold until Y or Enter. Wegolite: the line of `function activateMarketRow(`. Oolite:
   `src/Core/Entities/PlayerEntityControls.m:2864-2883`. Fidelity: `faithful`. Excerpt: E-192.
3. Mechanic: the market footer key legend names the mouse: `Up/Down/Click select` and `Double-click sell all/buy
   max`. Wegolite: the line of the `Double-click sell all/buy max` part in `src/ui/station-hints.ts`. Oolite:
   `src/Core/Entities/PlayerEntityControls.m:744-763`. Fidelity: divergence: Oolite's market shows no key or mouse
   legend; Wegolite's station footer carries one, and the owner asked on 2026-11-25 for the mouse to be named in the
   market line, kept short enough to fit at 1280x720. Then `PROJECT.md:` followed by the decision text `Unify the
   docked, chart and Save/Load footer on one two-line template with live key labels` written in double quotes (the
   only double-quoted text in that cell). Excerpt: E-191.
Append two excerpts after E-190, before `## Constants ledger`, in E-190's form (heading, blank line, a fenced
`objc` block): `### E-191 src/Core/Entities/PlayerEntityControls.m:744-763` and `### E-192
src/Core/Entities/PlayerEntityControls.m:2864-2883`, each block the exact lines of `git -C /home/opencode/git/oolite
show 7437f22:src/Core/Entities/PlayerEntityControls.m` (for example through `sed -n '744,763p'` on that output,
written to a /tmp file and pasted), leading whitespace kept. Do not add or change any PROJECT.md row.

README.md (O8). Add one sentence to the paragraph below the Docked station table: on the market, a click selects a
commodity and a double click opens the confirmation for the trade Oolite's Enter makes there (with Shift the most
you can buy, otherwise all you carry of it, otherwise the most you can buy); `Y` or `Enter` completes it.

CHANGELOG. Check that `[Unreleased]` holds exactly the Task 2 `### Added` and `### Changed` entries and that no line
under `## [0.8.1]` or older changed.

Format: `docker compose run --rm test npx prettier --write FIDELITY.md README.md CHANGELOG.md`. Verbatim check tree:
use `/tmp/claude-1027/-home-opencode-git-wegolite/df5840cd-f17f-4d52-8840-3acb682581b8/scratchpad/oolite-7437f22`
when it holds `src/Core/Entities/PlayerEntityControls.m`; otherwise `mkdir -p /tmp/oolite-7437f22 && git -C
/home/opencode/git/oolite archive 7437f22 src | tar -x -C /tmp/oolite-7437f22` and mount that instead.

Gates. Run the local full suite, then lint, then typecheck (not in parallel), commit (tag `quick-261125-ewd`), then
on the remote machine, in the foreground with a long timeout: the Chromium specs station-fkeys, station and
station-tabs, then `verify`, then `e2e-cross` (Firefox runs station-fkeys, including both mouse cases). If a spec
outside this plan pinned the old market hint, update only that expectation and say so in the SUMMARY. Record every
run's snapshot SHA, pass counts and elapsed time in the SUMMARY, and copy the two flags of the objective's Records
finding into the SUMMARY's open points.
  </action>
  <verify>
    <automated>docker compose run --rm test && docker compose run --rm lint && docker compose run --rm typecheck</automated>
    <automated>docker compose run --rm -v /tmp/claude-1027/-home-opencode-git-wegolite/df5840cd-f17f-4d52-8840-3acb682581b8/scratchpad/oolite-7437f22:/oolite -e OOLITE_SRC=/oolite test npx vitest run tests/contract/fidelity.test.ts</automated>
    <automated>rg -c '^### E-' FIDELITY.md [HEAD=190 EXPECT==192]; rg -c 'quick 261125-ewd' FIDELITY.md [HEAD=0 EXPECT==3]; rg -c 'PlayerEntityControls.m:744-763' FIDELITY.md [HEAD=0 EXPECT==3]; rg -c 'PlayerEntityControls.m:2864-2883' FIDELITY.md [HEAD=0 EXPECT==2]; rg -c -i 'double click' README.md [HEAD=0 EXPECT>=1]; git diff --quiet ebda38c0 -- .planning/PROJECT.md (exit 0); git diff --numstat ebda38c0 -- CHANGELOG.md (invariant, released sections untouched: the deleted-lines column is 0)</automated>
    <automated>After the commit: /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/station-fkeys.spec.ts tests/e2e/station.spec.ts tests/e2e/station-tabs.spec.ts --project=chromium" && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e-cross</automated>
  </verify>
  <done>FIDELITY has the two faithful rows (E-191, E-192) and the hint divergence row quoting the footer-legend decision, contiguous excerpts E-1 to E-192, and passes the contract test in both modes; PROJECT.md is unchanged; README names the mouse on the market; CHANGELOG [Unreleased] has Added and Changed only; local test, lint, typecheck and remote Chromium specs, verify and e2e-cross are green on the committed HEAD.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| DOM event -> station controller | a click or double click on the market tbody carries a `data-key` string and a Shift flag into the session |
| click path -> trade path | a double click must only plan; the apply path stays behind the `[Y/N]` confirmation |
| mouse event -> queued key edges | a click applied between frames could reorder against keys queued in the same frame |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ewd-01 | Tampering | `selectMarketRow` / `activateMarketRow` in src/app/session/station-controller.ts | medium | mitigate | The key is accepted only when `selectableKeys()` includes it (allow-list of current selectable rows; `__proto__`, empty and unknown keys unit-tested); the guard helper repeats every docked, screen, overlay, pause, game-over and pre-roll condition because the DOM is not a trust boundary |
| T-ewd-02 | Elevation of privilege | double click completing a trade without confirmation | high | mitigate | `activateMarketRow` only plans through `planFor` and the shared commit helper; it never calls `confirmTrade`, `applyBuy`, `applySell`, `commitProfile` or `autosave`; unit tests assert the profile and market objects are unchanged, no autosave and no lastTrade after every double-click case, and the browser case asserts unchanged credits and cargo |
| T-ewd-03 | Tampering | ordering of a click against queued key edges (start-session.ts wiring) | low | mitigate | Both handlers call `flushQueuedEdges()` before the controller, as the synchronous F-key sink does; the browser case dispatches a key and a click in one task in both orders |
| T-ewd-04 | Denial of service | the delegated listeners in src/ui/station.ts | low | mitigate | Two listeners on the persistent tbody, removed with the shell's AbortController on dispose; rows stay non-focusable `tr` elements, so native Enter or Space cannot bypass the action layer (T-05-25) |
| T-ewd-SC | Tampering | npm/pip/cargo installs | low | accept | This plan installs no package; no dependency or lockfile changes |
</threat_model>

<verification>
- Unit: station-controller (click select, double-click chain and fall-through, no-trade invariant, allow-list,
  guards), station-hints (new pins, rebind), dead-mode-gates (5), queued-edge-flush, fidelity contract (with and
  without OOLITE_SRC); full local `test`, `lint`, `typecheck`.
- Content: `src/content/generated/` and `third_party/` unchanged; `.planning/PROJECT.md` unchanged.
- Browser (remote, committed HEAD): Chromium station-fkeys, station, station-tabs; `verify`; `e2e-cross` (Firefox
  runs both mouse cases).
</verification>

<success_criteria>
- A click selects a selectable market row with the keyboard's side effects; a click on the selected row or on a row
  the keys cannot select does nothing; clicks are inert outside the visible docked Market.
- A double click plans Oolite's Enter trade (Shift buy max, else sell all when held, else buy max, with Oolite's
  fall-through) and only opens the `[Y/N]` line or the refusal notice; Y or Enter completes it.
- Keys pressed before and after a click in the same frame keep their order.
- Pointer cursor on selectable rows only; the market hint names the mouse, lists Left before Right, and fits at
  1280x720 in Chromium and Firefox.
- FIDELITY, CHANGELOG and README match the behaviour; all gates green.
</success_criteria>

<output>
Create `.planning/quick/261125-ewd-market-mouse-row-select-and-double-click/261125-ewd-SUMMARY.md` when done
</output>
