# Phase 5: Docked Economy & Station Screens - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the docked economy loop and the four station screens that expose it, all inside one keyboard-driven station computer rendered in DOM/CSS:

- **F8 Market** — 16 tradeable commodities priced and stocked by Oolite's economy-only formula (127-unit cap, same buy/sell price, integer decicredits, trades never move the price), with buying and selling against credits, hold, and station stock.
- **F3 Outfitting** — buy-only equipment screen over the v1 peaceful equipment set, including catalogue removal entries.
- **F5 Status** — two pages: ship/commander status and the cargo manifest.
- **F7 System data** — structured system figures plus the compiled planetinfo description.

Not in this phase: charts (F6), save/load (F2), market persistence or migrations, flight-state changes, combat equipment effects, legal consequences, resale, sound. Those belong to Phase 6, later phases, or are out of scope by PROJECT.md.

</domain>

<decisions>
## Implementation Decisions

### Station screen shell & navigation
- **D-01:** One station computer. The existing docked panel becomes its home/menu screen; each F-key opens a full-screen section; `Esc`/`Backspace` returns to the menu. A single owner controls visibility and focus.
- **D-02:** Full-screen terminal chrome: persistent header (system name + credit balance) and persistent footer (key hints and messages); black background with green monospace text; screens fully cover the 3D view.
- **D-03:** Launch is available only from the home screen via `1`/`F1`. Number keys pressed inside a section must never launch the ship.
- **D-04:** F5 has two pages — page 1 status (commander name, ship name, current system, hyperspace target, condition, fuel, credits, legal status, rating, equipment list) and page 2 cargo manifest with units and capacity. `Tab`/`PageUp`/`PageDown` switch pages, with a visible page indicator.
- **D-05:** F7 shows the structured fields (economy, government, displayed tech level = raw + 1, population in billions to one decimal, gross productivity in `M₢`, radius in km, distance) **plus** the compiled `System.description` text from planetinfo. Labels come from `labels.json`; no generated prose.

### Market trading (F8)
- **D-06:** Quantity model: arrow keys change by one unit; `Shift`+arrow jumps to the maximum feasible amount. The footer shows a confirmation line before committing (`Buy 12 t Food for 45.6 Cr? [Y/N]`). Infeasible requests clamp to the feasible amount and explain why in the footer (`Only 16 t available`); the trade is never blocked wholesale.
- **D-07:** Units follow the commodity: bulk goods in t, gold and platinum in kg, gem-stones in g. Quantity steps are 1 kg / 1 g; the row price is per kg/g. Pod conversion is 1,000 kg for gold/platinum and 1,000,000 g for gem-stones; 499 kg / 499,999 g fit without consuming a new pod. Every cost is computed in integer decicredits.
- **D-08:** F8 rows use fixed Oolite-style columns — name, unit, unit price, for-sale stock, in-hold amount, and an `Ex` flag for export-illegal goods. Zero-stock rows stay visible but dimmed. Alien Items stays visible as a dimmed, non-interactive row with stock shown as `—`. One row per commodity, no side detail pane, ordered by `sortOrder`.
- **D-09:** Credits render as one decimal plus `Cr`; the hold line shows used/capacity (20 t, or 35 t with the cargo bay).

### Outfitting (F3)
- **D-10:** The screen only sells. "Removes" from ECON-05 is satisfied by catalogue removal entries (`EQ_PASSENGER_BERTH_REMOVAL`, `EQ_MISSILE_REMOVAL`) bought like any other item. Purchased equipment is never resold — this matches core Oolite and avoids a depreciation money loop.
- **D-11:** Visible set is the peaceful research set: Fuel (only when the tank is not full), Large Cargo Bay (+15 t), Docking Computers, Galactic Hyperdrive, Advanced Space Compass, Advanced Navigational Array, Missile, Passenger Berth, plus removal entries. Combat and defensive items (lasers, shields, ECM, scoops, escape pod, energy unit, fuel injection, targeting) are hidden entirely.
- **D-12:** Purchase effects apply immediately and do not advance the clock: fuel tops up at 0.2 Cr per 0.1 LY without ship-mass scaling; the cargo bay raises capacity by 15 t at once; the docking computer becomes available at once. Oolite's `600 + price` seconds install delay is explicitly out of v1 because docked screens have no time model.
- **D-13:** Purchasable items are listed normally. Items failing tech level or ship conditions are shown dimmed and non-interactive with a short reason (`Requires TL 9`); nothing unavailable is ever purchasable. Fuel is hidden when the tank is full. The selected item shows its description and price.
- **D-14:** Missiles are multi-instance up to 3 at 30 Cr each, displayed `Missile (2/3)`. Passenger berths are 825.0 Cr each (8250 dc, the compiled catalogue price; amended from the original "82.5 Cr" by user decision 2026-11-05, see PROJECT.md Key Decisions), consume 5 t of cargo space each, and are buyable while space remains. Every other item is single-instance.
- **D-15:** Removal entries appear as ordinary rows only when there is something to remove (`Remove Passenger Berth — 100 Cr`, `Remove Missile — 20 Cr`); they are selected and confirmed like any purchase, with no special keys.
- **D-16:** F3 uses the same footer Y/N confirmation as F8 (`Buy Large Cargo Bay for 400.0 Cr? [Y/N]`); refusals (credits, tech level) use the same footer line.

### Market state & determinism
- **D-17:** Prices and stock are generated on every docking event for the current system. Re-docking produces a fresh market, matching Oolite's `setSystemTo:` behaviour of destroying and regenerating the market. **Reversibility:** costly — moving generation to another moment changes fixture values and every screen test that observes stock.
- **D-18:** The triangular random term comes from a deterministic PRNG seeded from a hash of `(systemId, arrival counter)`. Each docking differs, but the same arrival is reproducible; `Math.random` never enters `src/sim`. The counter is maintained by the session and starts at 0 on a new game or load.
- **D-19:** Cargo and credits live in the persisted profile and are autosaved on every accepted trade; market stock lives only in memory and is regenerated on load as a new arrival. Cargo and balance are written together, so reloading cannot duplicate money. Market persistence and migrations stay in Phase 6. **Reversibility:** costly — extending the strict save schema is a published-contract change that Phase 6 must not have to undo.
- **D-20:** Market fixtures are golden JSON files under `tests/golden/` for a few characteristic systems (Lave agricultural, Zaonce industrial, one high-tech system) with a fixed seed, covering all 17 commodities with price and stock, compared exactly like the existing content goldens.

### Content & display
- **D-21:** Commodity `name` becomes the human-readable display name at build time, compiled from `descriptions.plist` (`Food`, `Gem-Stones`, …); `key` remains the identity. Screens read `name` directly with no UI-side resolution. Content goldens and the drift check must be regenerated. **Reversibility:** costly — changing the emitted content shape touches the drift baseline and any test asserting the localization key.

### the agent's Discretion
- Save-schema mechanism for cargo (optional field on v1 versus a version bump): the chosen route must keep existing Phase 4 v1 blobs readable and must not invent a migration that belongs to Phase 6.
- PRNG algorithm and hash construction, and where the arrival counter is stored in session state.
- Exact DOM structure, class names, focus model, and scroll behaviour of the station shell.
- Where market generation lives, provided it is pure and deterministic and `src/sim` stays free of DOM and Three.js.
- Numeric formatting helpers and column widths.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning
- `.planning/PROJECT.md` — scope, locked key decisions (raw tech-level gating, purchase autosave, save schema, probe-only evidence).
- `.planning/REQUIREMENTS.md` — ECON-01…ECON-09 are the acceptance source.
- `.planning/ROADMAP.md` §Phase 5 — goal and the four success criteria.
- `.planning/phases/02-content-pipeline/02-CONTEXT.md` — D-10 (no Oolite condition-script evaluation), D-13 (integer decicredits, unit tags, pod conversion), D-24 (`market_definition` tri-state; Phase 5 owns the formula), D-25 (raw values, +1 TL at render).
- `.planning/phases/04-docking-and-persistence/04-CONTEXT.md` — D-10 (docked panel line replaced by outfitting), D-15 (Phase 6 owns persistence and migrations).

### Research
- `.planning/research/FEATURES.md` §E — economy formula, 127 cap, worked Lave/Zaonce examples.
- `.planning/research/FEATURES.md` §F — equipment/cargo units, pod conversion, fuel, v1 equipment table.
- `.planning/research/FEATURES.md` §G — station screen contents and key flow.

### Content and schemas
- `src/content/schemas/commodity.ts` — commodity record shape, units, pod conversion, legality, sort order.
- `src/content/schemas/equipment.ts` — equipment record shape, `techLevel`, `price`, `conditions`.
- `src/content/schemas/system.ts` — system record; `techLevelRaw`, `population`, `productivity`, `radiusKm`, `description`.
- `src/content/schemas/labels.ts` — economy/government/legal-status arrays and `sysdata-*` templates.
- `src/content/types.ts` — the only type-only content door for `src/sim`.
- `src/content/generated/commodities.json` — 17 goods with averages, random/economic coefficients, units, pod conversion.
- `src/content/generated/equipment.json` — 41 equipment entries with prices, tech levels, conditions, visibility flags.
- `src/content/generated/labels.json` — display labels and format templates.
- `src/content/generated/systems/g0.json` — Lave record used for the canonical trade run.
- `src/content/equipment.ts` — `loadEquipment`, `findEquipment`, `EquipmentError`.

### Existing UI, app, and persistence
- `src/ui/docked.ts` — current docked panel and its `DockedPanel` API; becomes the home screen.
- `src/app/game-session.ts` — docked/in-flight switch, panel lifecycle, profile commit and autosave hooks.
- `index.html` — docked panel markup and the inline terminal styling to extend.
- `src/input/actions.ts` — semantic action map and default bindings; screen actions belong here.
- `src/sim/player/profile.ts` — `PlayerProfile`, `canPurchase`, `purchase`, `formatCredits`; reuse unchanged.
- `src/persistence/save.ts` — strict `SaveV1Schema`, allow-lists, encoding bounds.
- `src/persistence/autosave.ts` — `snapshotForSave`, `restoreFromSave`.

### Upstream Oolite (read-only reference checkout)
- `/home/opencode/git/oolite/src/Core/OOCommodities.m` — price/quantity formula and 127 cap.
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m` — `setGuiToStatusScreen`, `setGuiToSystemDataScreen`, `setGuiToEquipShipScreen`, market screen.
- `/home/opencode/git/oolite/Resources/Config/descriptions.plist` — `commodity-name *` display names.
- `/home/opencode/git/oolite/Resources/Config/equipment.plist` — equipment metadata and conditions.
- `/home/opencode/git/oolite/Resources/Config/trade-goods.plist` — commodity averages and coefficients.
- `/home/opencode/git/oolite/Resources/Config/planetinfo.plist` — system data and descriptions.
- `/home/opencode/git/oolite/Resources/Config/keyconfig.plist` — screen key defaults.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createDockedPanel(root)` / `DockedPanel` — already owns show/hide, field updates, message line, and action bindings via `[data-field]`/`[data-action]`; extend into the station shell rather than replacing it.
- `canPurchase(profile, item, techLevelRaw)` and `purchase(profile, item)` — validated, refusal-returning purchase path; reuse unchanged so TL gating stays raw.
- `formatCredits(dc)` — one-decimal `Cr` formatting already matches the locked display.
- `loadEquipment()` / `findEquipment()` — cached strict-zod catalogue access for F3.
- `labels.json` economy/government arrays and `sysdata-*` templates — ready-made F7 labels.
- `System.description` and `System.inhabitants` — already compiled; F7 needs no text generation.

### Established Patterns
- All UI text through `textContent`; no `innerHTML`.
- Listener cleanup via `AbortController`; panel `dispose()` on teardown.
- `src/sim` imports only type-only content (`src/content/types.ts`) and must stay DOM/Three-free; guards enforce this.
- Content is generated, never hand-edited; goldens plus SHA-256 drift gate catch changes.
- Evidence is `window.__wegolite` probes and console errors — no screenshot or pixel-diff assertions.
- Container-only verification: `docker compose run --rm verify` / `e2e`.

### Integration Points
- `GameSession` docked branch: `docked.show(system.name)` on arrival, `onLaunch`/`onBuyDockComputer` callbacks, `docked.hide()` on launch, `autosave()` after accepted profile changes.
- `SaveV1Schema` is strict and currently has no cargo field; persistence of the manifest must be added without breaking existing v1 blobs.
- `src/input/actions.ts` has no screen actions yet; F3/F5/F7/F8 and page navigation must be added as semantic actions with rebindable defaults.
- `Command` is payload-free; trade and purchase requests are docked UI actions, so decide whether they become commands or session calls rather than smuggling payloads into `Command`.

</code_context>

<specifics>
## Specific Ideas

- Canonical first trade run must work with the generated numbers: buy Food at Lave (~3.8 Cr/t), sell at Zaonce (~7.0 Cr/t), buy Computers at Zaonce (~67.8 Cr/t), sell at Lave (~90.2 Cr/t); Lave food stock (~16 t) being below the 20 t hold is expected, not a bug.
- Footer confirmations read like `Buy 12 t Food for 45.6 Cr? [Y/N]` and `Sell 20 t Computers for 1804.2 Cr? [Y/N]`.
- Dimmed equipment reasons are short and literal: `Requires TL 9`, `Already installed`, `Not enough credits`.
- F5 manifest must show units per commodity (t/kg/g), because gold, platinum, and gem-stones are not tons.
- Tech level is displayed as raw + 1 but gated on the raw value — the two must never be conflated in the UI layer.

</specifics>

<deferred>
## Deferred Ideas

- **F6 Charts screen** — Phase 6 (NAV).
- **F2 Save/load screen** and market persistence/migrations — Phase 6.
- **Effects of Galactic Hyperdrive, Advanced Space Compass, Advanced Navigational Array** — bought in Phase 5, functional in Phase 6.
- **F8 filter/sort** — roadmap marks it P2; fixed sort order in v1.
- **Legal consequences for slaves, narcotics, firearms** — v1 shows the `Ex` flag only.
- **Combat/defensive equipment** (lasers, shields, ECM, scoops, escape pod, energy unit, fuel injection, targeting) — hidden in v1, returns with combat in v2.
- **Equipment resale / depreciation** — deliberately absent; core Oolite has no resale.
- **Oolite install delay (`600 + price` seconds)** and ship-mass fuel pricing — out of v1 because docked screens have no time model.
- **Other-language commodity names** — v1 is English-only; the build resolves `descriptions.plist` once.

</deferred>

---

*Phase: 5-Docked Economy & Station Screens*
*Context gathered: 2026-11-05*
