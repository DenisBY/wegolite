---
phase: quick
plan: 261124-nbu
type: execute
wave: 1
depends_on: []
files_modified:
  - src/content/schemas/commodity.ts
  - tools/oolite-ingest/convert/commodities.ts
  - tools/oolite-ingest/convert/commodities.test.ts
  - tests/golden/content/commodities.json
  - tests/fixtures/schemas/commodity-invalid.json
  - src/content/generated/commodities.json
  - src/content/generated/manifest.json
  - src/ui/station-model.ts
  - src/ui/station.ts
  - index.html
  - src/app/session/station-controller.ts
  - src/app/session/context.ts
  - src/app/probe.ts
  - src/ui/station-hints.ts
  - tests/ui/station-market.test.ts
  - tests/ui/station-hints.test.ts
  - tests/app/session/station-controller.test.ts
  - tests/e2e/station-fkeys.spec.ts
  - FIDELITY.md
  - .planning/PROJECT.md
  - CHANGELOG.md
  - README.md
  - .planning/todos/pending/2026-11-24-second-f5-f8-press-oolite-subscreens.md
autonomous: true
requirements: [ECON-04, ECON-06, ECON-09]

estimate:
  tokens: 170000
  raw_tokens: 170000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "R2: Docked on the Market list with no overlay open, F8 (or 8) opens Market Info for the selected commodity: the probe reads station.screen 'market' and station.page 2; the panel heading reads 'Commodity: <name>'; the table shows the market headings and exactly one row, the selected commodity with its hold quantity and no selected highlight; a comment line shows the commodity's compiled comment; the cash-and-load line stays"
    - "R2: Food's comment reads 'No additional information available'; slaves, narcotics and firearms read 'It is illegal to export this good from Cooperative stations.'; both strings reach the screen only through the content build (trade-goods.plist comment expanded through descriptions.plist, default [oolite-commodity-no-comment])"
    - "R1/R2: F8 on Market Info returns to the Market list (page 1) with the same commodity selected; F8 from any other screen, or with the chart or the F2 screen open over the Market, opens the Market list on page 1"
    - "R2: With no selected commodity, F8 on the Market stays on the Market list (Oolite's fallback to setGuiToMarketScreen); Up and Down on Market Info move the selection and Market Info follows it; the trade keys keep working on Market Info as on the list"
    - "R1: F5 on Status page 1 with no overlay open shows the Manifest (Status page 2); F5 on the Manifest, on any other screen, or with the chart or the F2 screen open shows Status page 1"
    - "R3: The docked footer key-hint line names the next press, from the live bindings: Status 'F5 manifest', Manifest 'F5 status', Market 'F8 commodity info', Market Info 'F8 commodity list'; the Market Info hint line is not ellipsised at 1280x720"
    - "FIDELITY.md has faithful rows for the F5 and F8 second press, Market Info (two rows) and the compiled comment, plus two divergence rows for the footer hint that quote a new PROJECT.md Key Decisions row (owner decision 2026-11-24); tests/contract/fidelity.test.ts passes, also with OOLITE_SRC pointing at the 7437f22 tree"
    - "Generated content is regenerated, never hand-edited: assets:check passes; third_party/oolite (CHECKSUMS.sha256 included) is unchanged"
    - "Local docker compose run --rm test, lint and typecheck pass; on the remote machine the Chromium specs station-fkeys, station, station-tabs, autosave and context-loss pass, then verify and e2e-cross pass, all against the committed HEAD"
  artifacts:
    - path: src/content/schemas/commodity.ts
      provides: "the strict commodity schema with the compiled comment"
      contains: "comment:"
    - path: tools/oolite-ingest/convert/commodities.ts
      provides: "comment resolution through descriptions.plist, fail-closed on unsupported tokens"
      contains: "oolite-commodity-no-comment"
    - path: src/ui/station-model.ts
      provides: "MARKET_INFO_TITLE_TEMPLATE and the Market Info part of buildMarketModel"
      contains: "Commodity: %@"
    - path: src/app/session/station-controller.ts
      provides: "the F5 and F8 second-press branches in navigateByKey and the Market Info fallback"
      contains: "marketInfoAvailable"
    - path: src/ui/station-hints.ts
      provides: "the page-aware F5/F8 footer hints"
      contains: "commodity info"
    - path: index.html
      provides: "the market heading and Market Info comment fields"
      contains: "market-info-comment"
    - path: tests/e2e/station-fkeys.spec.ts
      provides: "browser cases for F5 F5, F5 F5 F5, F8 F8, F8 F8 F8, Up/Down on Market Info and the hints"
      contains: "Commodity: Slaves"
    - path: FIDELITY.md
      provides: "rows and excerpts E-185 to E-189"
      contains: "### E-189 src/Core/OOCommodityMarket.m:157-164"
  key_links:
    - from: tools/oolite-ingest/convert/commodities.ts
      to: src/content/generated/commodities.json
      via: "emitCommodities writes the resolved comment field (regenerated with docker compose run --rm assets)"
      pattern: "comment: record.comment"
    - from: src/app/session/station-controller.ts
      to: src/ui/station-model.ts
      via: "renderStation passes ctx.station.stationPage to buildMarketModel"
      pattern: "buildMarketModel\\("
    - from: src/ui/station.ts
      to: index.html
      via: "requireElement on data-field market-title and market-info-comment"
      pattern: "market-info-comment"
    - from: src/app/session/station-controller.ts
      to: src/ui/station-hints.ts
      via: "dockedHints(bindings, screen, page)"
      pattern: "dockedHints\\("
---

<objective>
Close the todo `.planning/todos/pending/2026-11-24-second-f5-f8-press-oolite-subscreens.md` by porting Oolite's
second F5 and F8 press and its Market Info screen, plus an owner-requested footer hint.

Owner requirements (2026-11-24, locked; cited as R1-R3 below):
- R1: As in Oolite's `pollGuiScreenControlsWithFKeyAlias` (`src/Core/Entities/PlayerEntityControls.m:3904-3916` and
  `:3955-3967` at the pin 7437f22): F5 on Status opens the Manifest, F5 anywhere else (the Manifest included) opens
  Status; F8 on the Market opens Market Info, F8 anywhere else (Market Info included) opens the Market. In Wegolite
  the Manifest is Status page 2.
- R2: Port `setGuiToMarketInfoScreen` (`src/Core/Entities/PlayerEntity.m:9895` at the pin): title `Commodity: %@`,
  the market headings and the selected commodity's line with its hold quantity, the contracted line only with cargo
  contracts (Wegolite has none, so it never draws), the commodity comment from `trade-goods.plist` expanded through
  `descriptions.plist` or `oolite-commodity-no-comment`, then the cash-and-load line; with no selected commodity it
  falls back to the Market. Content flows through the content build from the vendored `third_party/oolite/Config`.
- R3: An on-screen hint about the second press. Oolite has none, so it is a recorded divergence citing the owner
  decision 2026-11-24. Small, in the existing UI style, English.

Findings from planning (so the executor does not re-derive them):
- Oolite reaches Market Info only through F8 on the Market (other `setGuiToMarketInfoScreen` calls are redraws on
  Market Info itself, unpause or mission-screen restores, none reachable in Wegolite). There is no mouse path into or
  out of it; double-click acts only on `GUI_SCREEN_MARKET`. On Market Info, Up/Down cycle the selected commodity in
  the sorted market order and redraw Market Info (`PlayerEntityControls.m:2766-2790` at the pin), and buy/sell keys
  work as on the Market (`pollMarketScreenControls` serves both screens).
- Wegolite tracks the market selection in `ctx.station.stationSelection` (shared with F3; `ensureSelection` on every
  market open keeps a selectable good or picks the first one, "" when none is selectable).
- Design (Claude's discretion): Market Info is page 2 of the `market` screen, mirroring the Manifest as page 2 of
  `status`. The screen stays `market`, so the tab strip keeps Market active, every existing market guard and trade
  key works on Market Info, and `tests/e2e/station-fkeys.spec.ts`'s per-screen loop keeps passing. The hidden
  `marketInfo` slot in `src/ui/station-tabs.ts` stays hidden. Re-clicking the active Market tab stays a no-op and
  Market Info gets no sub-tab (PROJECT.md tab-strip decision; Oolite has no mouse path).
- Design (Claude's discretion): the R3 hint is one more part in the docked footer key-hint line (`dockedHints`), the
  existing per-screen key legend, derived from the live bindings: Status `F5 manifest`, Manifest `F5 status`, Market
  `F8 commodity info`, Market Info `F8 commodity list` (the last echoes Oolite's unused
  `oolite-commodity-info-return` "return to commodity list"). The longest line (Market Info, about 128 characters)
  fits the 1280 px footer (12.75 px monospace, about 158 characters).

Output: the Market Info screen, the F5/F8 second press, the footer hint, FIDELITY rows E-185 to E-189, a PROJECT.md
Key Decisions row, CHANGELOG and README entries, and the todo moved to `.planning/todos/completed/`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/todos/pending/2026-11-24-second-f5-f8-press-oolite-subscreens.md
@.planning/debug/resolved/docked-f-keys.md

Project rules for this plan (from AGENTS.md, binding):
- Tests and builds run in Docker only; host Node/npm/Playwright are not evidence. Local: `docker compose run --rm test`
  (full), `docker compose run --rm test npx vitest run <file>` (targeted), `lint`, `typecheck`. Browser specs, `verify`
  and `e2e-cross` run on the remote machine only through `~/.claude/scripts/wegolite-remote-run.sh <compose args>`,
  which syncs the COMMITTED HEAD, so commit before every remote run.
- Scratch files only under `/tmp` (mounted into the container), never in the repository.
- Never hand-edit `src/content/generated/`; regenerate with `docker compose run --rm assets`. Do not touch
  `third_party/oolite/` (vendored, CHECKSUMS.sha256 must stay honest).
- Read Oolite behaviour from the checkout `/home/opencode/git/oolite`; FIDELITY excerpts must be verbatim from
  `git -C /home/opencode/git/oolite show 7437f22:<path>` (the checkout HEAD has moved; its line numbers differ).
- When the codebase-memory MCP is available, explore with it (projects `wegolite`, `oolite`); otherwise prefer `rg`.
- All committed text in English. CHANGELOG `[Unreleased]` entries land in the same commit as the change.
- `tests/guards/dead-mode-gates.test.ts` pins 5 negative mode comparisons in `src/app/session/station-controller.ts`.
  Add no new mode comparison there; if the count changes anyway, re-pin it with a one-line reason.
- FIDELITY divergence rows: the FIRST double-quoted string in the Fidelity cell must be the PROJECT.md Key Decisions
  text (`tests/contract/fidelity.test.ts` takes the first quote); write every other literal in backticks.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: End-to-end "F8 twice opens Market Info" — content comment, model, shell, controller, one browser case</name>
  <files>src/content/schemas/commodity.ts, tools/oolite-ingest/convert/commodities.ts, tools/oolite-ingest/convert/commodities.test.ts, tests/golden/content/commodities.json, tests/fixtures/schemas/commodity-invalid.json, src/content/generated/commodities.json, src/content/generated/manifest.json, src/ui/station-model.ts, src/ui/station.ts, index.html, src/app/session/station-controller.ts, src/app/session/context.ts, src/app/probe.ts, tests/ui/station-market.test.ts, tests/app/session/station-controller.test.ts, tests/e2e/station-fkeys.spec.ts, CHANGELOG.md</files>
  <read_first>
    - tools/oolite-ingest/convert/commodities.ts (project, resolveName, compileCommodities, emitCommodities)
    - src/content/schemas/commodity.ts
    - tools/oolite-ingest/failure-contract.test.ts:140-170 (the two commodity-invalid fixture cases)
    - src/ui/station-model.ts:267-476 (MarketRow, MarketModel, buildMarketModel)
    - src/ui/station.ts (renderMarketRows, render) and index.html market panel (around line 1994) and its CSS (around 405-430)
    - src/app/session/station-controller.ts:640-1000 (currentNavState, renderStation, openStationScreen, navigateByKey)
    - tests/app/session/station-controller.test.ts:352-495 (navHarness pattern)
    - tests/e2e/station-fkeys.spec.ts (boot, waitForPlace, settleFrames, expectNoReload)
    - tests/ui/station-status.test.ts:233-260 (the descriptions.plist pin pattern)
    - /home/opencode/git/oolite at 7437f22: src/Core/Entities/PlayerEntity.m:9895-9980, src/Core/OOCommodityMarket.m:157-164
  </read_first>
  <behavior>
    - compileCommodities: slaves, narcotics and firearms get comment "It is illegal to export this good from Cooperative stations."; every other record (alien_items included) gets "No additional information available"; every comment is non-empty and contains no "[" or "]"
    - A synthetic plist: an absent or empty comment resolves to the no-comment text; a bracket-free comment is kept verbatim; a whole "[key]" token resolves through descriptions; an unknown key, a mixed string with a token, a resolved text that still contains a token, and a non-string comment each throw a SCHEMA content error naming commodities.<key>.comment (or the descriptions key)
    - buildMarketModel with page 2 and a selection in the market: page 2, title "Commodity: Food", info.row is the Food row (hold quantity included), info.comment is the record's comment, cashLoadText unchanged; with page 2 and selection "" or a key not in the market: page 1, info null, title "Market"; page 1 is the old model plus page 1, title "Market", info null
    - MARKET_INFO_TITLE_TEMPLATE equals the vendored descriptions.plist value of oolite-commodity-information-@ ("Commodity: %@")
    - navigateByKey: F8 from Home opens market page 1; F8 again sets page 2, clears the pending plan and notice, makes no overlay call; F8 a third time returns to page 1 with the same selection; F8 with the chart (or the F2 screen) open over market page 1 closes it and lands on page 1, not Market Info; F8 on page 1 with nothing selectable (selection "") stays on page 1
    - On market page 2, applyStationAction stationDown (context dockScreen) moves the selection, keeps page 2, and the last rendered view's market.info.row.key is the new selection
    - renderStation on market page 2 with a selection no longer in the market renders page 1 and sets stationPage to 1
  </behavior>
  <action>
Content (R2: the comment through the content build). In `src/content/schemas/commodity.ts` add a required
`comment: z.string().min(1)` (after `tradeable`) and document it as Oolite's `commentForGood` value resolved at build
time. In `tools/oolite-ingest/convert/commodities.ts`, mirror the name pattern: `project()` puts the authored
`comment` string into the candidate, or Oolite's default token `[oolite-commodity-no-comment]` when the key is absent
(`OOCommodityMarket.m:163` at the pin: `defaultValue:@"[oolite-commodity-no-comment]"`); a non-string `comment` is a
SCHEMA error at `commodities.<key>.comment`. Then `compileCommodities` resolves it with a new `resolveComment`: an empty
string resolves as the default token (Oolite then prints the no-comment text, `PlayerEntity.m:9955-9956`); a string
that is exactly one `[key]` token resolves to the string value of that descriptions.plist key; a string with no
brackets is kept verbatim; anything else (mixed text and token, an unknown key, a resolved value that itself contains a
bracket token, an empty resolved value other than through the default) is a SCHEMA error, never a raw token on screen.
Add `comment: record.comment` to the `emitCommodities` JSON projection. Extend `commodities.test.ts` per the behaviour
list (real plists plus small synthetic ones through `parseOpenStep`). Add a valid `"comment"` to both records of
`tests/fixtures/schemas/commodity-invalid.json` so each keeps exactly its one intended defect (otherwise the missing
field becomes the first Zod issue and the failure-contract construct assertions change). Regenerate with
`docker compose run --rm assets`; `git status --porcelain src/content/generated public third_party` must list only
`src/content/generated/commodities.json` and `src/content/generated/manifest.json` (stop and investigate anything
else). Copy the regenerated comments into `tests/golden/content/commodities.json` (canonical key order, `comment`
right after `classes`), then format both JSON test files with `docker compose run --rm test npx prettier --write
tests/golden/content/commodities.json tests/fixtures/schemas/commodity-invalid.json`.

Model (R2). In `src/ui/station-model.ts` export `MARKET_TITLE = "Market"` (the current static heading) and
`MARKET_INFO_TITLE_TEMPLATE = "Commodity: %@"` (Oolite's `oolite-commodity-information-@`), a `MarketInfo` interface
`{ row: MarketRow; comment: string }`, and extend `MarketModel` with `page: 1 | 2`, `title: string` and
`info: MarketInfo | null`. `buildMarketModel` gains a last parameter `page: number = 1`: page 2 is honoured only when
the selection names a market row whose commodity record exists (Oolite's `indexOfObject` test,
`PlayerEntity.m:9928-9937`); otherwise the model is page 1 (Oolite's fallback). Page 2 sets the title from the
template with the commodity name and `info.comment` from the record. Do not draw a contracted line: Oolite draws it
only when `contractedVolumeForGood` is positive (`:9946-9951`) and Wegolite has no cargo contracts; say so in a code
comment. Add the model cases and the descriptions.plist pin (same reader as `tests/ui/station-status.test.ts:233-245`)
to `tests/ui/station-market.test.ts`.

Shell (R2). In `index.html` give the market `h2` `data-field="market-title"` and add, between the table and the
cash-and-load line, `<p class="station-market-info" data-field="market-info-comment" hidden></p>`; add a small CSS rule
in the existing market block only if the line needs spacing (same font, the panel's description colour). In
`src/ui/station.ts` require both elements and, in the market render, write `model.title` into the heading; on page 2
render only `info.row` in the body without the `selected` class (Oolite calls `setNoSelectedRow` before showing Market
Info, `PlayerEntityControls.m:3963-3964` at the pin) and show the comment; on page 1 render every row as today and hide
and empty the comment. All text through `textContent`.

Controller (R1/R2). In `src/app/session/station-controller.ts` add `marketInfoAvailable()` (selection non-empty, in
`ctx.core.market.goods` and in the catalogue). In `navigateByKey`, after the existing early returns and before the
overlay closers, compute whether an overlay is open (`ctx.chart.chartOpen || ctx.save.saveScreenOpen`); when none is
open, the action is `stationMarket`, the screen is `market` and the page is 1: if `marketInfoAvailable()` set
`stationPage = 2`, clear `stationPending` and `stationNotice`, `renderStation()` and return; otherwise fall through to
`openStationScreen` (Oolite's fallback redraws the Market). Everything else keeps today's path, so F8 on page 2, or
with an overlay open, opens the list on page 1 and `ensureSelection` keeps the commodity. Rewrite the `navigateByKey`
doc comment: the sentence that says a section key re-runs its open path on its own screen now holds for F3 and F4
only; cite R1's Oolite lines. In `renderStation`, before building models, reset a market page 2 whose
`marketInfoAvailable()` is false to page 1 (precedent: the `outfittingFacingFor` reset at its top), and pass
`ctx.station.stationPage` to `buildMarketModel`. Update the `page` docs in `src/app/probe.ts`
(`WegoliteStationProbe.page`: F5 Status 1 / Manifest 2, F8 Market 1 / Market Info 2, else 1) and on
`stationPage` in `src/app/session/context.ts`. Add the controller cases from the behaviour list to the
`navigateByKey` describe block of `tests/app/session/station-controller.test.ts` (build the empty-selection market by
copying the harness market with every stock set to 0 and an empty hold).

Browser case (tracer end-to-end). In `tests/e2e/station-fkeys.spec.ts` add a test: boot, press F8, wait for market
page 1 with `station.selectedKey === "food"` (Lave's first selectable good, as in core-loop.spec.ts); press F8, wait for
`station.page === 2`; assert `#docked [data-field="market-title"]` has text `Commodity: Food`, the market body has one
row with `data-key="food"`, and `[data-field="market-info-comment"]` is visible with `No additional information
available`; press ArrowDown three times and wait for `selectedKey === "slaves"` (Lave's golden market order: food,
textiles, radioactives, slaves), still page 2, title `Commodity: Slaves` and the illegal-export comment; press F8 and
wait for page 1 with 17 rows and `slaves` still selected; end with `expectNoReload` and no console errors.

CHANGELOG (same commit): under `## [Unreleased]` add `### Added`: the market (F8) has Oolite's commodity information
screen; press F8 again on the market to see the selected commodity's line and Oolite's note on it (slaves, narcotics
and firearms may not be exported from Cooperative stations); F8 once more returns to the list.

Run the targeted checks below, commit (subject tag `quick-261124-nbu`), then run the remote Chromium spec.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tools/oolite-ingest/convert/commodities.test.ts tools/oolite-ingest/failure-contract.test.ts tools/oolite-ingest/drift.test.ts tests/ui/station-market.test.ts tests/app/session/station-controller.test.ts tests/guards/dead-mode-gates.test.ts && docker compose run --rm assets npm run assets:check && docker compose run --rm typecheck</automated>
    <automated>rg -c '"comment"' src/content/generated/commodities.json [HEAD=0 EXPECT==17]; rg -c '"comment"' tests/golden/content/commodities.json [HEAD=0 EXPECT==17]; rg -c 'market-info-comment' index.html [HEAD=0 EXPECT>=1]; git diff --quiet HEAD -- third_party (exit 0)</automated>
    <automated>After the commit: ~/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/station-fkeys.spec.ts --project=chromium"</automated>
  </verify>
  <done>F8 twice opens Market Info with the compiled comment in Chromium, F8 again returns to the list; the converter, model and controller tests pass; assets:check passes with only commodities.json and manifest.json regenerated; the CHANGELOG entry is in the same commit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: F5 twice shows the Manifest, and the footer names the next F5/F8 press</name>
  <files>src/app/session/station-controller.ts, src/ui/station-hints.ts, tests/ui/station-hints.test.ts, tests/app/session/station-controller.test.ts, tests/e2e/station-fkeys.spec.ts, CHANGELOG.md</files>
  <read_first>
    - src/ui/station-hints.ts and tests/ui/station-hints.test.ts (exact pinned strings, rebind cases)
    - src/app/session/station-controller.ts navigateByKey and renderStation as left by Task 1
    - index.html footer CSS (around line 1016-1062: hints ellipsise rather than wrap)
  </read_first>
  <behavior>
    - navigateByKey: F5 from Home opens status page 1; F5 again sets page 2 with no overlay call; F5 a third time returns to page 1; F5 with the chart open over status page 1 calls closeChart and lands on page 1 (Oolite: the current GUI screen is the chart, not Status); the same with the F2 screen open (closeSaveScreen); paused, game over or pre-roll: nothing changes
    - dockedHints(defaults, "status") and dockedHints(defaults, "status", 1) equal "Tab/PageDown next page · PageUp previous · F5 manifest · Esc back · P pause"; page 2 equals the same with "F5 status"
    - dockedHints(defaults, "market", 1) equals "Up/Down select · Right buys +1 · Left sells +1 · Shift max · Enter/Y confirm · N cancel · F8 commodity info · Esc back · P pause"; page 2 equals the same with "F8 commodity list"
    - home, outfitting and interfaces strings are unchanged for any page; a rebind of stationStatus or stationMarket changes the hint key label; an unbound action renders "(unbound) manifest" like the other parts
  </behavior>
  <action>
Controller (R1). In `navigateByKey` add the F5 twin of Task 1's F8 branch, in the same no-overlay block: when the
action is `stationStatus`, the screen is `status` and the page is 1, set `stationPage = 2`, clear `stationPending` and
`stationNotice`, `renderStation()` and return. Page 2, another screen or an open overlay falls through to
`openStationScreen`, which opens Status page 1 (Oolite's `else [self setGuiToStatusScreen]`,
`PlayerEntityControls.m:3907-3911` at the pin). Do not change `setStationPage`, the Tab/PageDown/PageUp paging or the
tab-strip click path (re-clicking the active tab stays a no-op per the PROJECT.md tab-strip decision). Add the
controller cases from the behaviour list.

Hint (R3, owner decision 2026-11-24, recorded divergence). In `src/ui/station-hints.ts` give `dockedHints` a third
parameter `page: 1 | 2 = 1`. For `status`, insert `${primaryOrUnbound(bindings, "stationStatus")} manifest` (page 1)
or `... status` (page 2) right before the back part; for `market`, insert
`${primaryOrUnbound(bindings, "stationMarket")} commodity info` (page 1) or `... commodity list` (page 2) right before
the back part. Note in the module doc that these parts are a Wegolite addition Oolite does not have (owner decision
2026-11-24, FIDELITY rows added in Task 3). In `renderStation` pass `ctx.station.stationPage` (after Task 1's market
normalisation) as the page. Update `tests/ui/station-hints.test.ts`: pin all four page strings exactly, keep the other
pins, and add a rebind case for the new parts.

Browser cases. In `tests/e2e/station-fkeys.spec.ts` add: (a) F5 from Home -> status page 1 and the footer
`#docked [data-footer-role="hints"]` contains `F5 manifest`; F5 -> page 2, `[data-status-page="2"]` visible, hints
contain `F5 status`; F5 -> page 1 again; (b) at a 1280x720 viewport, F8 -> hints contain `F8 commodity info`; F8 ->
Market Info, hints contain `F8 commodity list` and the hints element's `scrollWidth` is at most its `clientWidth` (not
ellipsised). Both end with `expectNoReload` and no console errors. The existing per-screen loop must still pass
unchanged (the second press keeps the screen `status`/`market`).

CHANGELOG (same commit), under `## [Unreleased]`: `### Changed`: F5 on the status screen now shows the manifest, as in
Oolite, and F5 on the manifest returns to the status page. `### Added`: the status, manifest, market and commodity
information footers show what the next F5 or F8 press opens (Oolite has no such hint).

Run the checks below, commit (tag `quick-261124-nbu`), then run the remote Chromium spec.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/ui/station-hints.test.ts tests/app/session/station-controller.test.ts tests/guards/dead-mode-gates.test.ts && docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>rg -c 'commodity info' src/ui/station-hints.ts [HEAD=0 EXPECT>=1]; rg -c 'F5 manifest' tests/e2e/station-fkeys.spec.ts [HEAD=0 EXPECT>=1]</automated>
    <automated>After the commit: ~/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/station-fkeys.spec.ts --project=chromium"</automated>
  </verify>
  <done>F5 twice shows the Manifest and F5 again returns to Status in unit and browser tests; the four page-aware hints are pinned and visible, the Market Info hint line is not ellipsised at 1280x720; CHANGELOG entries are in the same commit.</done>
</task>

<task type="auto">
  <name>Task 3: Record fidelity and the owner decision, update docs, close the todo, run every gate</name>
  <files>FIDELITY.md, .planning/PROJECT.md, README.md, .planning/todos/pending/2026-11-24-second-f5-f8-press-oolite-subscreens.md</files>
  <read_first>
    - FIDELITY.md rows E-183 and E-184 (around line 213-214) and the E-184 excerpt (around line 3035); tests/contract/fidelity.test.ts (row and excerpt rules)
    - .planning/PROJECT.md Key Decisions table (ends around line 348)
    - README.md "Docked station" table (around line 86-104)
  </read_first>
  <action>
PROJECT.md (R3). Append one row to the end of the Key Decisions table. Decision cell, exactly:
`A second F5 or F8 press opens Oolite's Manifest or Market Info, and the station footer names that press (owner decision 2026-11-24, quick 261124-nbu)`.
Rationale: Oolite's `pollGuiScreenControlsWithFKeyAlias` switches Status to Manifest and Market to Market Info on the
second press; Market Info is ported from `setGuiToMarketInfoScreen` as page 2 of the market screen, with the comment
compiled from `trade-goods.plist` and `descriptions.plist`; Oolite shows no hint for the second press and the owner
asked for one, so the footer names it; re-clicking the active tab stays a no-op and Market Info has no sub-tab, since
Oolite has no mouse path into it. Outcome: `✓ Good`. No double quotes and no pipes in any cell.

FIDELITY.md. Insert these rows after the E-184 row in the Mechanics table (Wegolite cells point at the current lines,
found with `rg -n`):
1. F5 on the Status page opens the Manifest; F5 anywhere else, the Manifest, an open chart and the F2 screen included,
   opens the Status page (quick 261124-nbu) | `src/app/session/station-controller.ts:<F5 branch>` |
   `src/Core/Entities/PlayerEntityControls.m:3904-3916` | faithful | E-185
2. F8 on the Market opens Market Info for the selected commodity; F8 anywhere else, Market Info, an open chart and the
   F2 screen included, opens the Market | `src/app/session/station-controller.ts:<F8 branch>` |
   `src/Core/Entities/PlayerEntityControls.m:3955-3967` | faithful | E-186
3. Market Info is titled `Commodity: %@` and shows the market headings and the selected commodity's line with its
   hold quantity; with no selected commodity F8 stays on the Market; the cargo-contracts line never draws because
   Wegolite has no cargo contracts | `src/ui/station-model.ts:<page-2 branch>` |
   `src/Core/Entities/PlayerEntity.m:9928-9944` | faithful | E-187
4. Market Info shows the commodity's comment, or `No additional information available`, then the cash-and-load line
   (E-99) | `src/ui/station-model.ts:<comment line>` | `src/Core/Entities/PlayerEntity.m:9953-9964` | faithful | E-188
5. A commodity's comment is its `trade-goods.plist` comment expanded through `descriptions.plist`, default
   `[oolite-commodity-no-comment]`, compiled by `tools/oolite-ingest/convert/commodities.ts` |
   `src/content/schemas/commodity.ts:<comment field>` | `src/Core/OOCommodityMarket.m:157-164` | faithful | E-189
6. The Status and Manifest footers name the next F5 press (`F5 manifest`, `F5 status`) |
   `src/ui/station-hints.ts:<status part>` | `src/Core/Entities/PlayerEntityControls.m:3904-3916` | divergence: Oolite
   switches the screens without any on-screen hint; the owner asked on 2026-11-24 for a hint about the second press,
   kept to one part of the existing footer key legend. PROJECT.md: "<the decision text above>" | E-185
7. The Market and Market Info footers name the next F8 press (`F8 commodity info`, `F8 commodity list`) |
   `src/ui/station-hints.ts:<market part>` | `src/Core/Entities/PlayerEntityControls.m:3955-3967` | divergence: same
   reasoning; `F8 commodity list` echoes Oolite's unused `oolite-commodity-info-return`. PROJECT.md: "<the decision
   text above>" | E-186
In rows 6 and 7 the PROJECT.md quote is the only double-quoted text. Re-point the Wegolite cells of rows E-183
(`navigateByKey`) and E-184 (the F6 no-op check) at their current lines. Append excerpts `### E-185 ...` to
`### E-189 ...` after the E-184 excerpt (before `## Constants ledger`), each a blank line then an `objc` fence holding
exactly the cited lines, extracted verbatim with
`git -C /home/opencode/git/oolite show 7437f22:<path> | sed -n '<a>,<b>p'`. Format with
`docker compose run --rm test npx prettier --write FIDELITY.md README.md CHANGELOG.md`. Check the excerpts verbatim:
`mkdir -p /tmp/oolite-7437f22 && git -C /home/opencode/git/oolite archive 7437f22 src | tar -x -C /tmp/oolite-7437f22`,
then the second command below.

README.md. Under the Docked station table add one sentence: on the status screen F5 (or 5) shows the manifest and on
the manifest it returns to the status page; on the market F8 (or 8) shows information on the selected commodity and
on that screen returns to the list, as in Oolite.

Todo. `git mv` the todo into `.planning/todos/completed/` and append `## Resolution (2026-11-24, quick 261124-nbu)`
naming the ported behaviour, the hint divergence (FIDELITY E-185/E-186 divergence rows) and the commits.

Gates. Run the local full suite, lint and typecheck, commit (tag `quick-261124-nbu`), then on the remote machine, in
the foreground with a long timeout: the Chromium specs that press F5/F8 or 5/8 (station-fkeys, station, station-tabs,
autosave, context-loss), then `verify`, then `e2e-cross` (Firefox runs station-fkeys). If a spec that pressed F8 or 8
on the Market (or F5 or 5 on Status) expected the old re-open, change its expectation only where the new behaviour is
the intended one, and say so in the SUMMARY. Record every run's snapshot SHA, pass counts and elapsed time in the
SUMMARY.
  </action>
  <verify>
    <automated>docker compose run --rm test && docker compose run --rm lint && docker compose run --rm typecheck</automated>
    <automated>docker compose run --rm -v /tmp/oolite-7437f22:/oolite -e OOLITE_SRC=/oolite test npx vitest run tests/contract/fidelity.test.ts</automated>
    <automated>rg -c '^### E-18[5-9] ' FIDELITY.md [HEAD=0 EXPECT==5]; rg -c "A second F5 or F8 press opens Oolite's Manifest or Market Info" .planning/PROJECT.md [HEAD=0 EXPECT==1]; test -f .planning/todos/completed/2026-11-24-second-f5-f8-press-oolite-subscreens.md</automated>
    <automated>After the commit: ~/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/station-fkeys.spec.ts tests/e2e/station.spec.ts tests/e2e/station-tabs.spec.ts tests/e2e/autosave.spec.ts tests/e2e/context-loss.spec.ts --project=chromium" && ~/.claude/scripts/wegolite-remote-run.sh run --rm verify && ~/.claude/scripts/wegolite-remote-run.sh run --rm e2e-cross</automated>
  </verify>
  <done>FIDELITY rows E-185 to E-189 and the two divergence rows pass the contract test, verbatim mode included; the PROJECT.md decision row exists; README and CHANGELOG describe the behaviour; the todo is in todos/completed; local test, lint and typecheck and remote Chromium specs, verify and e2e-cross are green on the committed HEAD.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| vendored plist -> content build | `trade-goods.plist` and `descriptions.plist` text becomes shipped JSON |
| keyboard/DOM -> station controller | key presses and clicks drive screen state |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-nbu-01 | Tampering | `resolveComment` in tools/oolite-ingest/convert/commodities.ts | low | mitigate | Only a whole `[key]` token or bracket-free text is accepted; unknown keys, mixed or nested tokens and non-string values fail the build with a SCHEMA error; the strict schema requires a non-empty string |
| T-nbu-02 | Tampering | Market Info title and comment in src/ui/station.ts | low | mitigate | Written with `textContent` only, never `innerHTML` (existing shell rule) |
| T-nbu-03 | Denial of service | F5 reaching the browser (page reload) on the second press | low | mitigate | The second press goes through the same capture-cancelled `navigateByKey` path; the new browser cases end with `expectNoReload` in Chromium and Firefox |
| T-nbu-04 | Elevation of privilege | Market Info trading | low | accept | Trades on page 2 use the unchanged plan, confirm and revalidation path of `applyStationAction` (live mode, context and screen are rechecked) |
</threat_model>

<verification>
- Unit: converter, failure contract, drift, market model, hints, station controller, dead-mode-gates and the fidelity
  contract (also with OOLITE_SRC) pass; the full local `docker compose run --rm test`, `lint` and `typecheck` pass.
- Content: `assets:check` passes; only `commodities.json` and `manifest.json` changed under `src/content/generated`;
  `third_party/` untouched.
- Browser (remote, committed HEAD): station-fkeys, station, station-tabs, autosave and context-loss in Chromium;
  `verify`; `e2e-cross`.
</verification>

<success_criteria>
- A second F5 on Status shows the Manifest and a second F8 on the Market shows Market Info, as in Oolite; a third press
  returns; an open overlay makes F5/F8 open the list or Status page 1.
- Market Info shows Oolite's title, the selected commodity's line, its compiled comment and the cash-and-load line, and
  falls back to the Market with no selection.
- The footer hints name the next F5/F8 press, recorded as an owner-decided divergence in FIDELITY.md and PROJECT.md.
- The todo is closed in `.planning/todos/completed/`.
</success_criteria>

<output>
Create `.planning/quick/261124-nbu-second-f5-and-f8-press-open-oolite-s-sub/261124-nbu-SUMMARY.md` when done
</output>
