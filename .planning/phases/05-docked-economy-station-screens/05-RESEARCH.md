# Phase 5: Docked Economy & Station Screens - Research

**Researched:** 2026-11-05
**Domain:** Oolite economy-only commodity market, cargo/pod accounting, equipment availability, keyboard-driven DOM station screens, additive save-schema extension
**Confidence:** HIGH for the Oolite formulas, cargo/pod arithmetic, equipment gating and screen contents (read from the Oolite checkout and the vendored configs this session); HIGH for the existing repo seams (read this session); MEDIUM for the station-shell/keyboard design and the PRNG/fixture choice (new design over verified seams, within D-18's discretion)

> **Owner amendment (2026-11-05) — supersedes the earlier draft text below.** The locked decisions changed after this research was written: D-10/D-15 adopt Oolite's missile-removal trade-in (200 dc charge + full catalogue-value refund of every mounted missile, net +700 dc at 3; berth removal stays 1000 dc with no refund); D-17 generates the market when the system is set, not on every docking; D-18 replaces the `(systemId, arrival)` hash with one persisted `marketSeed` (`marketSeedForSystem(systemId) = Number.parseInt(fnv1a32("<systemId>:0"), 16) >>> 0`); D-19 persists that seed in the save so a reload regenerates identical prices (stock may reset) and there is no arrival counter. **Note (2026-11-05 source check):** Oolite itself re-rolls on commander load from a time-seeded RNG (`GameController.m:93`); `market_rnd` is not the commodity-price seed. The persisted seed is a deliberate, owner-approved modernisation, not Oolite-exact. Wherever this document still says "arrival", "per-docking regeneration", "charge-only removal" or "no refund", read the amended decision and the six PLAN.md files. See `05-CONTEXT.md` D-10/D-15/D-17/D-18/D-19.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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
- **D-10:** The screen only sells. "Removes" from ECON-05 is satisfied by catalogue removal entries (`EQ_PASSENGER_BERTH_REMOVAL`, `EQ_MISSILE_REMOVAL`) bought like any other item. Purchased equipment is never resold. Removal economics follow Oolite: berth removal charges 1000 dc with no refund, while missile removal charges 200 dc and refunds the full catalogue value of every mounted missile (`PlayerEntity.m:9326-9330`, `:9410-9438`). **Amended 2026-11-05 by owner: supersedes the earlier no-refund reading for missiles.**
- **D-11:** Visible set is the peaceful research set: Fuel (only when the tank is not full), Large Cargo Bay (+15 t), Docking Computers, Galactic Hyperdrive, Advanced Space Compass, Advanced Navigational Array, Missile, Passenger Berth, plus removal entries. Combat and defensive items (lasers, shields, ECM, scoops, escape pod, energy unit, fuel injection, targeting) are hidden entirely.
- **D-12:** Purchase effects apply immediately and do not advance the clock: fuel tops up at 0.2 Cr per 0.1 LY without ship-mass scaling; the cargo bay raises capacity by 15 t at once; the docking computer becomes available at once. Oolite's `600 + price` seconds install delay is explicitly out of v1 because docked screens have no time model.
- **D-13:** Purchasable items are listed normally. Items failing tech level or ship conditions are shown dimmed and non-interactive with a short reason (`Requires TL 9`); nothing unavailable is ever purchasable. Fuel is hidden when the tank is full. The selected item shows its description and price.
- **D-14:** Missiles are multi-instance up to 3 at 30 Cr each, displayed `Missile (2/3)`. Passenger berths are 825.0 Cr each (8250 dc, the compiled catalogue price; amended from the original "82.5 Cr" by user decision 2026-11-05, see PROJECT.md Key Decisions), consume 5 t of cargo space each, and are buyable while space remains. Every other item is single-instance.
- **D-15:** Removal entries appear as ordinary rows only when there is something to remove (`Remove Passenger Berth — 100 Cr`, `Remove Missile — 20 Cr`); they are selected and confirmed like any purchase, with no special keys. **Amended 2026-11-05:** the missile-removal row description must state the full-value trade-in, not "No refund is paid".
- **D-16:** F3 uses the same footer Y/N confirmation as F8 (`Buy Large Cargo Bay for 400.0 Cr? [Y/N]`); refusals (credits, tech level) use the same footer line.

### Market state & determinism
- **D-17:** Prices and stock are generated when the current system is set, matching Oolite's `setSystemTo:` (`Universe.m:7173-7191`), not on every docking. Docking in the same system reuses the market. **Amended 2026-11-05 by owner:** Oolite also regenerates on commander load (`PlayerEntity.m:1078`, `:2005`) from a non-persisted, time-seeded RNG (`GameController.m:93`), so its reload can re-roll prices; Wegolite deliberately persists the seed and keeps reload stable (modernisation, not Oolite behaviour). Supersedes per-docking regeneration. **Reversibility:** costly — moving generation to another moment changes fixture values and every screen test that observes stock.
- **D-18:** Oolite's triangular random term draws from the global RANROT stream (`OOCommodities.m:389`, `:404`); `market_rnd` (`PlayerEntity.m:6527-6529`, saved `:844`/restored `:1415`) is **not** the commodity-price seed — it drives contracts, station update times, trade-in and reputation. Wegolite derives one deterministic persisted `marketSeed` per system; `Math.random` never enters `src/sim`. **Amended 2026-11-05 by owner: replaces the `(systemId, arrival)` hash seed; the persisted seed is a deliberate modernisation.**
- **D-19:** Cargo and credits live in the persisted profile and are autosaved on every accepted trade; the market seed lives in the save and is regenerated deterministically on load, so prices cannot change across a reload. Player-caused stock changes may reset on load; prices do not. **Amended 2026-11-05 by owner:** this is a deliberate modernisation — Oolite re-rolls on load from a non-persisted time-seeded stream. Phase 5 owns the seed field; Phase 6 owns re-seeding on hyperspace arrival.
- **D-20:** Market fixtures are golden JSON files under `tests/golden/` for a few characteristic systems (Lave agricultural, Zaonce industrial, one high-tech system) with a fixed `marketSeed`, covering all 17 commodities with price and stock, compared exactly like the existing content goldens.
- **D-21:** Commodity `name` becomes the human-readable display name at build time, compiled from `descriptions.plist` (`Food`, `Gem-Stones`, …); `key` remains the identity. Screens read `name` directly with no UI-side resolution. Content goldens and the drift check must be regenerated. **Reversibility:** costly — changing the emitted content shape touches the drift baseline and any test asserting the localization key.

### the agent's Discretion
- Save-schema mechanism for cargo (optional field on v1 versus a version bump): the chosen route must keep existing Phase 4 v1 blobs readable and must not invent a migration that belongs to Phase 6.
- PRNG algorithm and hash construction, and where the persisted `marketSeed` is stored in session state.
- Exact DOM structure, class names, focus model, and scroll behaviour of the station shell.
- Where market generation lives, provided it is pure and deterministic and `src/sim` stays free of DOM and Three.js.
- Numeric formatting helpers and column widths.

### Deferred Ideas (OUT OF SCOPE)
- **F6 Charts screen** — Phase 6 (NAV).
- **F2 Save/load screen** and market persistence/migrations — Phase 6.
- **Effects of Galactic Hyperdrive, Advanced Space Compass, Advanced Navigational Array** — bought in Phase 5, functional in Phase 6.
- **F8 filter/sort** — roadmap marks it P2; fixed sort order in v1.
- **Legal consequences for slaves, narcotics, firearms** — v1 shows the `Ex` flag only.
- **Combat/defensive equipment** (lasers, shields, ECM, scoops, escape pod, energy unit, fuel injection, targeting) — hidden in v1, returns with combat in v2.
- **Equipment resale / depreciation** — deliberately absent; core Oolite has no resale.
- **Oolite install delay (`600 + price` seconds)** and ship-mass fuel pricing — out of v1 because docked screens have no time model.
- **Other-language commodity names** — v1 is English-only; the build resolves `descriptions.plist` once.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ECON-01 | Market prices and stock use Oolite's economy-only formula and 127 cap, matching recorded fixtures | Exact `OOCommodities.m` formula, `economicBias`, float32 arithmetic, RANROT PRNG, generation order and a worked Lave/Zaonce/Leesti fixture recipe (§Economy Formula) |
| ECON-02 | 16 tradeable commodities buy/sell at the same price, trades do not move prices, money is integer decicredits | One price per good for both directions (`tryBuyingCommodity`/`trySellingCommodity` both read `priceForGood`); integer dc arithmetic; canonical trade run (§Trading) |
| ECON-03 | 20 t hold enforced; gold/platinum per kg, gem-stones per g, correct pod conversions | Oolite's exact `cargoQuantityOnBoard` pod formula and `setCargoQuantityForType` limits (§Cargo, Pods and Hold Accounting) |
| ECON-04 | F8 shows names, units, price, stock, hold; quantity selection with confirmation | Row model + footer confirm state machine (§Station Screens) |
| ECON-05 | F3 lists equipment with correct tech level/price, installs/removes legal items | Verified catalogue rows and condition rules; multi-instance and removal semantics (§Outfitting) |
| ECON-06 | F5 shows credits, fuel, cargo, equipment, ship identity | Profile-authoritative fields + two-page model (§Station Screens) |
| ECON-07 | F7 shows economy, government, TL, population, productivity, radius | Compiled `System` fields + `labels.json` templates; Lave/Zaonce/Leesti values verified (§Station Screens) |
| ECON-08 | Insufficient funds/hold/stock blocked with messages; credits never negative | `planBuy`/`planSell` clamp + refusal enum; safe-integer guards (§Trading) |
| ECON-09 | All station screens DOM/CSS, keyboard-navigable, usable without a mouse | Station-shell controller, key map, capture-phase handler, e2e keyboard proof (§Station Screens, §Validation Architecture) |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- **Everything runs in Docker.** The app and every test run in containers; a green host run is not evidence. Commands: `docker compose run --rm test`, `docker compose run --rm e2e`, `docker compose run --rm verify`, `docker compose run --rm lint`, `docker compose run --rm typecheck`, `docker compose run --rm assets npm run assets:check`.
- **No host npm/node.** Never propose host `npm install` / `npm test` / Playwright downloads. Adding a dependency requires an image rebuild **and** `docker compose down --volumes` (this research plans **no** dependency additions).
- **`src/sim/` purity.** No Three.js, no DOM, no `Math.random`, no wall clock. Content enters the sim as plain data or type-only imports from `src/content/types.ts`.
- **Content is generated, never hand-edited.** Any change to `src/content/generated/**` must be produced by `docker compose run --rm assets` and pass `assets:check`; the manifest SHA-256 rows are part of the contract.
- **No database.** IndexedDB autosave only; no server storage.
- **Licensing.** Project code GPL-2.0-or-later; Oolite-derived data stays CC BY-NC-SA 3.0. New generated commodity names/peaks are derived from the pinned snapshot — no new asset provenance row is needed, but do not add art/config outside the snapshot.
- **Record significant decisions** (PRNG/seed, save-schema extension, missile-removal refund policy) in `.planning/PROJECT.md` Key Decisions.
- **Start file-changing work through a GSD command** (`/gsd-execute-phase`).

## Summary

Phase 5 is almost entirely arithmetic and data projection over seams that already exist. The Oolite economy is small and fully readable: `economicBiasForGood` → `generateQuantityForGood` → `generatePriceForGood`, with `float` maths, truncating integer casts and a 127-unit cap. The repo already carries every authored coefficient, but **two pieces are missing from the emitted commodity record**: `peak_export`/`peak_import` (required by `economicBias`) and a resolved display name (`name` is currently the raw token `[commodity-name food]`). Both must be added to `CommoditySchema`, the converter, the generated JSON, the content golden and the drift baseline. The formulæ, the pod rules and the equipment gating are all verified against the Oolite checkout this session.

The hard integration problem is state, not maths. The existing `PlayerProfile` is `{credits, equipment: string[]}` with **unique** equipment keys, and both `purchase()` and `SaveV1Schema` reject duplicates. Missiles (up to 3) and passenger berths (multi-instance) cannot be represented, and cargo/fuel do not exist at all. Phase 5 must therefore extend the profile and the strict v1 save with **optional additive fields** (cargo entries, fuel, missiles, berths) rather than a version bump, so Phase 4 blobs still parse and no Phase 6 migration is invented. The station shell is a new DOM controller over the existing `#docked` root, with a mode-aware keyboard layer so `Esc` can mean "back" inside a screen without also toggling pause, and `1` cannot launch from inside a section.

The recommended build order is: content shape → pure economy/cargo modules with goldens → profile/save extension → outfitting rules → station view models → station shell + input contexts → session wiring → e2e keyboard proof. Three decisions need the planner's (or user's) confirmation before locking: the missile-removal net-refund semantics (resolved 2026-11-05: full trade-in), whether fuel is autosaved with cargo (resolved: yes), and how the persisted `marketSeed` defaults on a Phase 4 blob (`restore.marketSeed ?? marketSeedForSystem(system.id)`; there is no arrival counter).

**Primary recommendation:** Add `src/sim/economy/{ranrot,market,cargo,trade}.ts` and `src/sim/player/outfitting.ts` as pure modules; extend `CommoditySchema` with `peakExport`/`peakImport` and resolve `name` in the converter; extend `PlayerProfile` and `SaveV1Schema` with optional `cargo`/`fuel`/`missiles`/`passengerBerths`; build one `StationShell` DOM controller with a mode-aware action layer (`flight` / `dockHome` / `dockScreen`); prove every requirement with Node unit tests plus a keyboard-only Playwright spec that reads `window.__wegolite` probes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Resolve commodity display names + peaks | Build (`tools/oolite-ingest`) | — | Deterministic projection of the pinned plist; the runtime must not carry a name table or a plist parser |
| Generate market price/stock | `src/sim/economy/` (pure) | — | Deterministic, unit-testable, no DOM/Three; must never use `Math.random` |
| Pod/hold arithmetic | `src/sim/economy/` (pure) | — | Integer rules shared by market, outfitting and save validation |
| Buy/sell planning, clamping, integer money | `src/sim/economy/` (pure) | — | The single trusted money path; UI only displays the plan |
| Equipment visibility, conditions, install/remove | `src/sim/player/outfitting.ts` (pure) | Content catalogue (read-only) | Availability is a function of profile + system TL + catalogue conditions |
| Station screen layout, selection, focus | `src/ui/` (DOM) | — | DOM/CSS only; writes text via `textContent`; owns its `AbortController` |
| Keyboard semantics for docked screens | `src/input/` (DOM-free core) | `src/app/game-session.ts` (mode) | Actions stay semantic and rebindable; context filtering prevents `Esc`/`1` double-meaning |
| Session orchestration (persisted `marketSeed`, market lifetime, autosave) | `src/app/game-session.ts` | `src/persistence/` | The only place that knows a docking happened and that a profile change must become durable |
| Persist cargo/credits/fuel/counts | `src/persistence/` | `src/sim/player/profile.ts` | Strict zod schema + allow-lists; the profile is the single state object |
| Screen evidence (`window.__wegolite`) | `src/app/probe.ts` | e2e | D-08 evidence is probes and console errors, never pixels |

## Standard Stack

No new libraries. This phase is TypeScript + existing zod + existing Vitest/Playwright. Deliberately **no** `jsdom`, no state-management library, no decimal/money library, no UI framework.

### Core

| Library | Version | Purpose | Why standard here |
|---------|---------|---------|-------------------|
| TypeScript | 6.0.2 | implementation language | project-wide, strict mode (`tsconfig.json`, `tsconfig.sim.json`) |
| zod | 4.6.7 | strict validation of save + content | already the single trust boundary (`save.ts`, `equipment.ts`, `commodity.ts`) |
| Three.js | 0.187.0 | not touched by this phase | station screens are DOM/CSS and fully cover the canvas |
| Vite | 8.3.5 | `?raw` content loading | existing pattern for generated JSON |

### Supporting (tests)

| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| Vitest | 5.0.5 | unit/integration (Node) | economy, cargo, outfitting, save, view-model tests |
| Playwright | 1.64.1 | keyboard-only browser proof | `tests/e2e/station.spec.ts` |

**Installation:** none. Do not modify `package.json`; a dependency change would force `docker compose down --volumes` and is out of scope.

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Port Oolite RANROT | existing `createSeededRandom` (mulberry32) in `src/sim/math.ts:227-236` | mulberry32 is already in-repo and simpler, but RANROT's `randf()` has Oolite's exact 16-bit granularity; either is deterministic and valid under D-18 — fixtures must be generated from whichever is chosen |
| Optional additive fields on save v1 | bump to `version: 2` | v2 makes old builds treat new blobs as `future-version` (safer forward-compat) but requires a v1→v2 reader now, which D-19 assigns to Phase 6 |
| Node view-model tests + Playwright | add `jsdom` and a browser Vitest project | jsdom is a new devDependency and a container volume reset; the project's evidence rule already relies on Playwright probes |

## Package Legitimacy Audit

**No packages are installed or upgraded in this phase.** `docker compose run --rm assets npm run assets:check` regenerates content with the existing `tsx`; tests use the existing Vitest/Playwright images. The Package Legitimacy Gate is therefore not applicable; the planner must not add a `package.json` change to any task.

## Economy Formula (exact)

### Source of truth

`[VERIFIED: /home/opencode/git/oolite/src/Core/OOCommodities.m:383-411]` — the two generators, verbatim:

```objc
- (OOCargoQuantity)generateQuantityForGood:(NSDictionary*)good inEconomy:(OOEconomyID)economy
{
    float bias = [self economicBiasForGood:good inEconomy:economy];
    float base = [good oo_floatForKey:kOOCommodityQuantityAverage];
    float econ = base * [good oo_floatForKey:kOOCommodityQuantityEconomic] * bias;
    float random = base * [good oo_floatForKey:kOOCommodityQuantityRandom] * (randf() - randf());
    base += econ + random;
    if (base < 0.0) { return 0; } else { return (OOCargoQuantity)base; }
}

- (OOCreditsQuantity)generatePriceForGood:(NSDictionary*)good inEconomy:(OOEconomyID)economy
{
    float bias = [self economicBiasForGood:good inEconomy:economy];
    float base = [good oo_floatForKey:kOOCommodityPriceAverage];
    float econ = base * [good oo_floatForKey:kOOCommodityPriceEconomic] * -bias;
    float random = base * [good oo_floatForKey:kOOCommodityPriceRandom] * (randf() - randf());
    base += econ + random;
    if (base < 0.0) { return 0; } else { return (OOCreditsQuantity)base; }
}
```

`[VERIFIED: /home/opencode/git/oolite/src/Core/OOCommodities.m:431-452]` — `economicBiasForGood`, verbatim:

```objc
    int exDiff = abs(economy - exporter) * 2;
    int imDiff = abs(economy - importer) * 2;
    int distance = (exDiff + imDiff) / 2;
    if (exDiff == imDiff) { return 0.0; }
    else if (exDiff > imDiff) { return -(1.0 - ((float)imDiff / (float)distance)); }
    else { return 1.0 - ((float)exDiff / (float)distance); }
```

`[VERIFIED: /home/opencode/git/oolite/src/Core/OOCommodities.m:261-278]` — the per-good order is **quantity first, then price**, and the cap is applied before the definition is stored:

```objc
        OOCargoQuantity q = [self generateQuantityForGood:good inEconomy:economy];
        // main system market limited to 127 units of each item
        OOCargoQuantity cap = [good oo_unsignedIntForKey:kOOCommodityCapacity defaultValue:MAIN_SYSTEM_MARKET_LIMIT];
        if (q > cap) { q = cap; }
        OOCreditsQuantity p = [self generatePriceForGood:good inEconomy:economy];
```

`[VERIFIED: /home/opencode/git/oolite/src/Core/OOCommodities.h:29]` — `#define MAIN_SYSTEM_MARKET_LIMIT 127`.

`[VERIFIED: /home/opencode/git/oolite/src/Core/Universe.m:7173-7191]` — regeneration is a side effect of `setSystemTo:` (`DESTROY(commodityMarket); commodityMarket = [[commodities generateMarketForSystemWithEconomy:economy andScript:scriptName] retain];`), which is D-17's upstream justification for generating when the system is set (not for reload stability).

### Exact semantics to port

1. **All intermediate arithmetic is 32-bit `float`, not `double`.** `base`, `econ`, `random`, `bias` and the triangular term are `float`; only the bias's `1.0 - ...` expression is `double` and is converted to `float` on return. In TypeScript, wrap **every** intermediate in `Math.fround` in the same grouping as the C expression. A double-only port can differ by 1 decicredit at truncation; that is a fixture divergence, not a rounding preference.
2. **Truncation is toward zero** via a C cast; because `base < 0` returns 0 first, `Math.trunc` is safe. Do not use `Math.round` or `toFixed`.
3. **`randf()` is `(Ranrot() & 0xffff) * (1/65536)`** `[VERIFIED: /home/opencode/git/oolite/src/Core/legacy_random.c:142-145]`, so the triangular term is granular in 1/65536 steps.
4. **RANROT is a 32-bit wrapping generator** `[VERIFIED: /home/opencode/git/oolite/src/Core/legacy_random.c:87-114]`:

```objc
unsigned Ranrot(void)
{
    sRANROT.high = (sRANROT.high << 16) + (sRANROT.high >> 16);
    sRANROT.high += sRANROT.low;
    sRANROT.low += sRANROT.high;
    return sRANROT.high & 0x7FFFFFFF;
}

RANROTSeed MakeRanrotSeed(uint32_t seed)
{
    RANROTSeed result = { .low = seed, .high = ~seed };
    // Mix it up a bit.
    RanrotWithSeed(&result);
    RanrotWithSeed(&result);
    RanrotWithSeed(&result);
    return result;
}
```

Port with `>>> 0` after each add/shift and `Math.imul` where a 32-bit multiply is needed; `(high << 16)` in JS is already int32 and `>>> 0` reproduces the C wrap. `& 0x7FFFFFFF` is exact in JS.
5. **Four `randf()` calls per commodity**, in this order: quantity `r1 - r2`, then price `r1 - r2`. `alien_items` still consumes four calls (its coefficients are zero); skipping it shifts every later commodity and breaks the fixtures.
6. **Iteration order is ours, not Oolite's.** Oolite iterates an `NSDictionary` whose order is unspecified, so its actual values are not reproducible. Iterate `Commodity[]` sorted by `sortOrder` (the loader already sorts in `compileCommodities`, `[VERIFIED: tools/oolite-ingest/convert/commodities.ts:261]`).
7. **`randf() - randf()` evaluation order** is unspecified in C. Define it as left-to-right (`r1 = randf(); r2 = randf()`), because the fixtures are generated from our implementation. Document the choice beside the PRNG.
8. **Price and stock depend only on economy.** Tech level, government, population, productivity and radius must not enter the formula.
9. **Only the main station is in scope.** The Coriolis entry carries `"marketDefinition": { "kind": "empty" }` `[VERIFIED: src/content/generated/ships.json:5285-5289]`, so Phase 5 uses the system market. `absent` means a blank market (all zero) in Oolite; `explicit` (per-station modifiers) is not needed for the main station and should fail loudly or be left unimplemented with a comment, not silently treated as `empty`.

### Recommended PRNG + seed (D-18 discretion)

- Reuse the repo's FNV-1a 32-bit hash: `fnv1a32(text)` returns a **hex string** `[VERIFIED: src/sim/hash.ts:12-21]`. Derive the numeric seed with `marketSeedForSystem(systemId) = Number.parseInt(fnv1a32("<systemId>:0"), 16) >>> 0`.
- Seed RANROT with that 32-bit value (`low = seed`, `high = ~seed`, three mix rounds).
- `marketSeed` is a session-owned `uint32` persisted in the save. A new game uses `marketSeedForSystem(system.id)`; a restore uses `save.marketSeed ?? marketSeedForSystem(system.id)`; a `docked` event reuses the in-memory market and never re-seeds. Phase 6 owns re-seeding on hyperspace arrival. There is no arrival counter.
- Reproducible, stable across reloads and redocks, and `Math.random` never appears.

### Missing content fields (blocking)

`[VERIFIED: src/content/schemas/commodity.ts:25-42]` — the strict record has `priceAverage`, `priceEconomic`, `priceRandom`, `quantityAverage`, `quantityEconomic`, `quantityRandom`, … but **no `peakExport`/`peakImport`**. The converter never reads them `[VERIFIED: tools/oolite-ingest/convert/commodities.ts:173-222]`, and the generated JSON confirms their absence `[VERIFIED: src/content/generated/commodities.json:8-24]` (food has `legalityExport`, `priceAverage`, … but no peak keys), while the authored plist has them `[VERIFIED: third_party/oolite/Config/trade-goods.plist:9-10]`:

```
		"peak_export" = 7; // Poor Ag
		"peak_import" = 0; // Rich Ind
```

**Required change:** add `peakExport: z.number().int().min(0).max(7)` and `peakImport` to `CommoditySchema`; read `peak_export`/`peak_import` in `project()`; emit them in `emitCommodities()`; regenerate `src/content/generated/commodities.json`, `tests/golden/content/commodities.json` and `manifest.json`. Without this, no market can be generated.

### Worked fixtures (reference, to be regenerated by the implementation)

Seed inputs and computed anchors. **These numbers were produced by this researcher** from the verified formula, with `float32` emulation, RANROT, seeds `fnv1a32("g0-s7:0") = 0xd3515f15`, `fnv1a32("g0-s129:0") = 0xb2a31a0a`, `fnv1a32("g0-s55:0") = 0xdccb7b32`. They are a cross-check, not repo output; the implementation must generate the goldens and must not hard-code these tables. `[ASSUMED: computed reference values]`

System facts (all `[VERIFIED: src/content/generated/systems/g0.json]`; exact line numbers below):

| System | id | economy | government | techLevelRaw | population | productivity | radiusKm |
|--------|----|---------|------------|--------------|------------|--------------|----------|
| Lave | `g0-s7` | 5 | 3 | 4 | 25 | 7000 | 4116 |
| Zaonce | `g0-s129` | 1 | 7 | 11 | 53 | 41976 | 3873 |
| Leesti | `g0-s55` | 2 | 7 | 10 | 50 | 35200 | 3085 |

Lave lines: `description` :1005, `economy` :1006, `government` :1008, `id` :1009, `inhabitants` :1011, `name` :1020, `population` :1041, `productivity` :1085, `radiusKm` :1086, `techLevelRaw` :1117.
Zaonce lines: `description` :18087, `economy` :18088, `government` :18090, `id` :18091, `name` :18102, `population` :18122, `productivity` :18165, `radiusKm` :18166, `techLevelRaw` :18197.
Leesti lines: `description` :7727, `economy` :7728, `government` :7730, `id` :7731, `name` :7742, `population` :7762, `productivity` :7805, `radiusKm` :7806, `techLevelRaw` :7837.

**Lave (economy 5), marketSeed 0 — computed reference `[ASSUMED]`**

| key | price (dc/unit) | stock |
|-----|-----------------|-------|
| food | 38 | 16 |
| textiles | 63 | 15 |
| radioactives | 221 | 20 |
| slaves | 180 | 19 |
| liquor_wines | 258 | 28 |
| luxuries | 940 | 15 |
| narcotics | 241 | 37 |
| computers | 902 | 0 |
| machinery | 583 | 10 |
| alloys | 354 | 27 |
| firearms | 765 | 0 |
| furs | 662 | 47 |
| minerals | 114 | 58 |
| gold | 369 | 11 |
| platinum | 665 | 21 |
| gem_stones | 188 | 9 |
| alien_items | 522 | 0 |

**Anchor rows for the other two fixtures — computed reference `[ASSUMED]`**

| System | food | computers | gold | gem_stones | narcotics |
|--------|------|-----------|------|------------|-----------|
| Zaonce (economy 1) | 70 / 8 | 682 / 43 | 409 / 6 | 203 / 1 | 541 / 21 |
| Leesti (economy 2) | 62 / 10 | 731 / 30 | 384 / 6 | 190 / 8 | 590 / 36 |

These agree with the research appendix's canonical values (Lave food ≈ 3.8 Cr and 16 t; Lave computers ≈ 90.2 Cr and 0 t; Zaonce food ≈ 7.0 Cr and computers ≈ 68 Cr), which is the strongest available cross-check that the formula, the economy indexing and the float32 emulation are right.

**Canonical first trade run with these numbers** (20 t hold, 100.0 Cr start):

1. Lave: buy 16 t Food at 38 dc = 608 dc → 392 dc (39.2 Cr), hold 16/20.
2. Zaonce: sell 16 t Food at 70 dc = 1120 dc → 1512 dc (151.2 Cr), hold 0.
3. Zaonce: buy 2 t Computers at 682 dc = 1364 dc → 148 dc (14.8 Cr), hold 2/20 (stock 43, affordable 2).
4. Lave: sell 2 t Computers at 902 dc = 1804 dc → 1952 dc (195.2 Cr), profit 95.2 Cr.

Lave's 16 t food stock is **below** the 20 t hold on purpose: the player cannot fill the hold outbound. This is expected Oolite behaviour and must not be "fixed".

## Cargo, Pods and Hold Accounting

### The exact Oolite pod rule

`[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.h:1294-1297]`:

```objc
#define KILOGRAMS_PER_POD 1000
#define MAX_KILOGRAMS_IN_SAFE ((KILOGRAMS_PER_POD / 2) - 1)
#define GRAMS_PER_POD (KILOGRAMS_PER_POD * 1000)
#define MAX_GRAMS_IN_SAFE ((GRAMS_PER_POD / 2) - 1)
```

So `KILOGRAMS_PER_POD = 1000`, `MAX_KILOGRAMS_IN_SAFE = 499`, `GRAMS_PER_POD = 1_000_000`, `MAX_GRAMS_IN_SAFE = 499_999`.

`[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9508-9545]` — hold usage counts **pods**, and the kg/g conversion is:

```objc
            if (commodityUnits == UNITS_KILOGRAMS)
                quantity = ((KILOGRAMS_PER_POD - MAX_KILOGRAMS_IN_SAFE - 1) + quantity) / KILOGRAMS_PER_POD;
            else
                quantity = ((GRAMS_PER_POD - MAX_GRAMS_IN_SAFE - 1) + quantity) / GRAMS_PER_POD;
```

That is `floor((500 + qty) / 1000)` for kg and `floor((500000 + qty) / 1000000)` for g, using integer division. Consequences the plan must test:

- 0–499 kg → **0 pods** (rides in the "safe"); 500–1499 kg → 1 pod; 1500–2499 kg → 2 pods. The boundary values 499/500 and 1499/1500 are the tests that matter.
- The same threshold in grams is 0–499,999 g → 0 pods; 500,000–1,499,999 g → 1 pod.
- A **full hold can still buy up to 499 kg / 499,999 g** of a kg/g good without using a pod. This is explicitly D-07; do not "correct" it.

### Capacity

`[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/ShipEntity.m:7198-7214]`:

```objc
- (OOCargoQuantity)maxAvailableCargoSpace { return max_cargo - equipment_weight; }
- (OOCargoQuantity)availableCargoSpace
{
    if (EXPECT_NOT([self cargoQuantityOnBoard] + equipment_weight >= max_cargo)) return 0;
    return [self maxAvailableCargoSpace] - [self cargoQuantityOnBoard];
}
```

For Wegolite's single ship and single hold-affecting item:

```
capacityPods(profile) = 20
                      + (owns EQ_CARGO_BAY ? 15 : 0)
                      - 5 * passengerBerths
```

- The Cobra's base `maxCargo` is 20, `fuel` 70 and `maxFlightSpeed` 350 `[VERIFIED: src/content/generated/ships.json:15043,15079-15082]`; the Large Cargo Bay adds `extra_cargo = 15`.
- `equipment_weight` exists in Oolite only for equipment with `requires_cargo_space`; in the v1 peaceful set that is **only the passenger berth** (`requires_cargo_space: 5` `[VERIFIED: src/content/generated/equipment.json:312]`), and Oolite deliberately excludes berths from `equipment_weight` and instead reduces `max_cargo` by 5 per berth `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9396-9407]`: `max_cargo -= PASSENGER_BERTH_SPACE * addRemove;`. A berth therefore costs 5 t of total capacity whether or not the cargo bay is fitted; the cargo bay's +15 is applied first.
- No other item in the peaceful set consumes hold space.

### Buy limits

`[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9993-10062]` — Oolite clamps in this order: stock, affordability, hold. Port the *outcome*, not the code's TODOs:

- bulk (t): `feasible = min(stock, floor(credits / price), availablePods)`
- kg/g: `feasible = min(stock, floor(credits / price), availablePods * podSize + safeMax - alreadyHeld)` (never below 0)
- `availablePods = max(0, capacityPods - holdPodsUsed)`
- Commodity must be `tradeable`; `alien_items` always refuses.

### Sell limits

`[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:10074-10124]`:

- `feasible = min(held, 127 - stock)`, never below 0.
- Selling adds stock; it never changes price. A market already at 127 for that good cannot absorb more.
- Credits increase by `price * qty` in integer decicredits.

### Surprising but required behaviours

- `price` is per **unit** (t, kg or g) and the same for buying and selling; there is no spread.
- The 127 cap is on **stock units** for every good, including kg/g.
- The hold line ("Load X of Y t") displays **pods**, not physical mass; a hold full of ordinary goods plus 499 kg of gold still reports 20 t used, because the gold rides in the 499 kg "safe".
- Credits are integer decicredits end to end; display division happens only at render.

## Trading (F8 state machine)

### Where it lives

Pure module `src/sim/economy/trade.ts` (names are discretion, responsibilities are not):

```ts
interface MarketGood { readonly key: string; readonly price: number; readonly stock: number }
interface Market { readonly systemId: string; readonly marketSeed: number; readonly goods: readonly MarketGood[] }

type TradeSide = "buy" | "sell";
type TradeRefusal =
  | "notTradeable" | "nothingToSell" | "marketFull" | "noStock"
  | "insufficientCredits" | "holdFull" | "invalidPrice" | "zeroAmount";

interface TradePlan {
  readonly ok: boolean;
  readonly amount: number;        // feasible amount, 0 when ok=false
  readonly cost: number;          // integer decicredits, positive for buy and sell
  readonly refusal?: TradeRefusal;
  readonly clamp?: TradeRefusal;  // why a requested amount was reduced
}

planBuy(market, profile, commodity, requested): TradePlan
planSell(market, profile, commodity, requested): TradePlan
applyBuy(market, profile, commodity, amount): { market: Market; profile: PlayerProfile }
applySell(market, profile, commodity, amount): { market: Market; profile: PlayerProfile }
```

- `apply*` must re-check the plan and refuse (return the same objects) rather than trust the UI — same defence-in-depth as `buyDockComputer` re-running `canPurchase` `[VERIFIED: src/app/game-session.ts:354-364]`.
- Never subtract without `credits >= cost`; never add a non-safe integer.
- The market is immutable data; `apply*` returns a new `Market` with the one good's stock changed and the same price.

### Footer copy (D-06/D-09/D-16)

- Confirm: `Buy 12 t Food for 45.6 Cr? [Y/N]` / `Sell 20 t Computers for 1804.2 Cr? [Y/N]`.
- Clamp reason: `Only 16 t available` (stock), `Not enough credits` (affordability), `Hold full` / `Only N t of hold space` (capacity), `Station can only take N t` (sell capacity).
- Result: `Bought 12 t Food for 45.6 Cr` / `Sold 20 t Computers for 1804.2 Cr`.
- Unit word follows the commodity: `t`, `kg`, `g`.

### Key model (recommended, Oolite-faithful)

`Up`/`Down` move the selected row (the row must be selectable, so these cannot also change quantity). `Left`/`Right` change the pending amount by one unit; `Shift+Left`/`Shift+Right` jump to the feasible maximum for sell/buy; `Y` commits; `N` cancels; `Esc`/`Backspace` returns to home. This is consistent with D-06 ("arrow keys change by one unit", "Shift+arrow jumps to maximum") and with Oolite's market keys (`key_gui_arrow_left/right/up/down` `[VERIFIED: third_party/oolite/Config/keyconfig.plist:14-21]`).

### Command boundary

Docked trade and purchase requests are **session calls, not `Command`s**. `Command` is payload-free by contract `[VERIFIED: src/sim/commands.ts:13-25]`; a `{kind:"buy", commodity, qty}` variant would violate that and force the sim to know UI state. The station shell calls a session method, which applies a pure plan and calls `commitProfile` + `autosave`. Keep `Command` unchanged.

## Outfitting (F3)

### Verified catalogue rows

All prices are integer decicredits; all tech levels are raw.

| Item | Key | TL | Price (dc) | Display / rules | Provenance |
|------|-----|----|-----------|-----------------|------------|
| Fuel | `EQ_FUEL` | 0 | 2 per 0.1 LY | row price = `(70 − fuel) * 2`; hidden at full; `requires_non_full_fuel` | `[VERIFIED: src/content/generated/equipment.json:100-115]` |
| Large Cargo Bay | `EQ_CARGO_BAY` | 1 | 4000 | +15 t capacity | `[VERIFIED: src/content/generated/equipment.json:26-37]` |
| Docking Computers | `EQ_DOCK_COMP` | 9 | 15000 | immediate ownership | `[VERIFIED: src/content/generated/equipment.json:53-63]` |
| Galactic Hyperdrive | `EQ_GAL_DRIVE` | 10 | 50000 | one-shot in Phase 6 | `[VERIFIED: src/content/generated/equipment.json:141-152]` |
| Advanced Space Compass | `EQ_ADVANCED_COMPASS` | 7 | 6500 | Phase 6 effect | `[VERIFIED: src/content/generated/equipment.json:2-13]` |
| Advanced Navigational Array | `EQ_ADVANCED_NAVIGATIONAL_ARRAY` | 6 | 22500 | Phase 6 effect | `[VERIFIED: src/content/generated/equipment.json:14-25]` |
| Missile | `EQ_MISSILE` | 1 | 300 | max 3; `requires_empty_pylon` | `[VERIFIED: src/content/generated/equipment.json:224-236]` |
| Passenger Berth | `EQ_PASSENGER_BERTH` | 5 | 8250 | multi; 5 t each; `requires_cargo_space: 5` | `[VERIFIED: src/content/generated/equipment.json:305-320]` |
| Remove Passenger Berth | `EQ_PASSENGER_BERTH_REMOVAL` | 1 | 1000 | only when berths > 0 | `[VERIFIED: src/content/generated/equipment.json:321-334]` |
| Remove Missile | `EQ_MISSILE_REMOVAL` | 1 | 200 | only when missiles > 0; removes all | `[VERIFIED: src/content/generated/equipment.json:237-249]` |

This matches D-11/D-14/D-15 on every row except the passenger berth: the compiled catalogue and Oolite price it at 8250 dc (825.0 Cr), so D-14's stated 82.5 Cr is a mis-statement corrected in PROJECT.md (30 Cr missile, 825.0 Cr berth, 100 Cr berth removal, 20 Cr missile removal, 400 Cr cargo bay, 1500 Cr computer, 5000 Cr gal drive, 650 Cr compass, 2250 Cr ANA).

**ROADMAP criterion 4 vs D-13.** Criterion 4 says the screen "lists only equipment whose tech level and conditions are met"; D-13 refines that to "shown dimmed and non-interactive with a short reason; nothing unavailable is ever purchasable" (the discussion log records the refinement). Implement D-13: the visible set is D-11's, unavailable entries are dimmed, and the purchase path refuses — this satisfies criterion 4's intent without hiding the catalogue.

### Condition rules to hand-implement (D-13/D-14)

`[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/ShipEntity.m:3057-3078]`:

```objc
    if ([eqType requiresEmptyPylon] && [self missileCount] >= [self missileCapacity] && !loading) return NO;
    if ([eqType requiresMountedPylon] && [self missileCount] == 0 && !loading) return NO;
    if ([self availableCargoSpace] < [eqType requiredCargoSpace] && !validationForDamagedEquipment && !loading) return NO;
    ...
    if ([eqType requiresFreePassengerBerth] && [self passengerCount] >= [self passengerCapacity]) return NO;
    if ([eqType requiresFullFuel] && [self fuel] < [self fuelCapacity] && !loading) return NO;
    if ([eqType requiresNonFullFuel] && [self fuel] >= [self fuelCapacity] && !loading) return NO;
```

For the v1 peaceful set that reduces to:

- `requires_empty_pylon` (Missile): refuse if `missiles >= 3`.
  - **Deliberate deviation:** Oolite's Cobra has `PLAYER_MAX_MISSILES 16` / `PLAYER_STARTING_MAX_MISSILES 4` `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.h:284-286]`, so Oolite would allow a fourth missile. D-14 caps Wegolite at 3; record the cap in PROJECT.md and do not "fix" it back to 4.
- `requires_mounted_pylon` (Remove Missile): row visible only if `missiles > 0`.
- `requires_cargo_space: 5` (Passenger Berth): refuse if `availablePods < 5`.
- `requires_free_passenger_berth` (Remove Passenger Berth): row visible only if `passengerBerths > 0`.
- `requires_non_full_fuel` (Fuel): row hidden if `fuel >= 70`.
- `available_to_all` is metadata only; D-11's fixed visible set supersedes the Cobra's optional-equipment filter.

**Important Oolite nuance** `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9396-9407]`: `requires_free_passenger_berth` is checked as `passengerCount >= passengerCapacity`, which in Oolite means "no free berth". For the v1 model with no passengers, expose the removal row iff `passengerBerths > 0` (D-15) and implement the refusal as `passengerBerths === 0`.

### Tech-level gate uses the raw value (again)

`[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:8226]` sets `OOTechLevelID techlevel = [[UNIVERSE currentSystemData] oo_intForKey:KEY_TECHLEVEL];` and compares it to `eqType.effectiveTechLevel`; the display adds +1 only in `setGuiToSystemDataScreen` (`NSUInteger techLevel = [infoSystemData oo_intForKey:KEY_TECHLEVEL] + 1;` `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:7531]`). Lave is raw 4. At a new game at Lave the concrete screen is: **Large Cargo Bay** purchasable (TL 1); **Missile** shown but disabled at `3/3` with `Pylons full`; **Remove Missile** visible (there are missiles to remove); **Fuel hidden** (tank full); **Passenger Berth** (TL 5), **ANA** (6), **Compass** (7), **Dock Computer** (9) and **Gal Drive** (10) dimmed with `Requires TL N`. This is the same rule `canPurchase` already enforces `[VERIFIED: src/sim/player/profile.ts:98-120]`.

Do **not** port the "bargain tech days" `dayRnd & 7` discount `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:8275-8285]`: it depends on a day clock that does not exist while docked in v1, and D-13 is silent on it. Record the omission.

### Fuel pricing

`[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:8386-8387]`:

```objc
                if ([eqKey isEqual:@"EQ_FUEL"]) {
                    price = (PLAYER_MAX_FUEL - fuel) * pricePerUnit * [self fuelChargeRate];
```

`PLAYER_MAX_FUEL` is 70 `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.h:278-283]`. D-12 sets `fuelChargeRate = 1` (no ship-mass scaling), so:

```
fuelCost = (70 - fuel) * 2   // decicredits; fuel is integer tenths of a LY
```

Empty→full is 140 dc (14.0 Cr); 3.4 LY remaining→full is 36 × 2 = 72 dc (7.2 Cr). The F3 row must show the **fill cost**, not the 0.2 Cr unit price; showing `0.2 Cr` is the classic bug.

**No clock advance (D-12).** A purchase is a session call outside the fixed step. `stepFlight` advances `clockSeconds`/`flightTime` only when `modeAtStart !== "docked"` `[VERIFIED: src/sim/flight/step.ts:147-155]`, so the docked clock is already frozen; the purchase code must not add a delta of its own. Do not port Oolite's `600 + price` install time.

### Multi-instance representation (the blocker)

The current profile and save cannot express missiles or berths:

- `purchase()` refuses a key already in `equipment` `[VERIFIED: src/sim/player/profile.ts:136-137]`.
- `parseSave` treats a duplicate equipment key as `corrupt` `[VERIFIED: src/persistence/save.ts:208-214]`.

Recommended model (do not encode counts as duplicate keys):

```
PlayerProfile {
  credits: number;
  equipment: readonly string[];   // unique: cargo bay, dock comp, gal drive, compass, ANA
  cargo: Readonly<Record<string, number>>;  // key -> units (t/kg/g)
  fuel: number;                   // 0..70 tenths of a LY
  missiles: number;               // 0..3
  passengerBerths: number;        // 0..7
}
```

`equipment` stays unique (preserves the existing duplicate-rejection guarantee and test); `missiles`/`passengerBerths` are explicit counts. Purchasing a berth increments `passengerBerths` and never touches `equipment`; the F5 equipment list renders `Passenger Berth ×N` from the count. Purchasing a missile increments `missiles`. This also makes `snapshotForSave(state, profile, …)` need no signature change.

### Removal semantics — one unresolved money question

`[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9326-9329]` and `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9431-9437]`:

```objc
    if ([eqKey isEqualToString:@"EQ_MISSILE_REMOVAL"]) {
        credits -= price;
        tradeIn += [self removeMissiles];
        [self doTradeIn:tradeIn forPriceFactor:priceFactor];
        return YES;
    }
```

`removeMissiles` returns the full catalogue price of every mounted missile, and `doTradeIn` adds it back. So core Oolite **refunds 300 dc per missile and charges the 200 dc removal fee**: with 3 missiles the net is `+900 − 200 = +700 dc` (+70.0 Cr), not `−20 Cr`. D-10 says "purchased equipment is never resold"; D-15 shows `Remove Missile — 20 Cr`. These are not contradictory if "no resale" means the outfitting list has no sell-back row, while the missile removal entry is the catalogue's explicit trade-in. Recommendation: implement the faithful net refund and show it in the confirmation (e.g. `Remove all missiles: +70.0 Cr net?`), but this needs explicit confirmation before locking (see Assumptions A3). The simpler alternative — charge 20 Cr and lose the missiles — is a deliberate deviation and must be recorded in PROJECT.md.

Passenger-berth removal is unambiguous: charge 100 Cr, `passengerBerths -= 1`, reclaim 5 t, no resale.

## Station Screens

### Existing shell and what must change

`[VERIFIED: src/ui/docked.ts:30-42]` — the current API is tiny:

```ts
export interface DockedPanel {
  show(systemName: string): void;
  hide(): void;
  setMessage(text: string): void;
  setCredits(text: string): void;
  setDockComputer(view: DockComputerView): void;
  onLaunch(handler: () => void): void;
  onBuyDockComputer(handler: () => void): void;
  dispose(): void;
}
```

It owns `[data-field="system"|"credits"|"ship"|"fuel"|"message"|"dockcomp"|"dockcomp-message"]`, `[data-action="launch"|"buy-dockcomp"]`, one `AbortController`, and sets every dynamic string with `textContent` `[VERIFIED: src/ui/docked.ts:44-124]`. The markup lives in `index.html` `#docked` `[VERIFIED: index.html:359-389]` and the terminal styling is `#docked { position:absolute; inset:0; background:rgba(0,8,3,0.88); color:#33ff66; font:18px/1.7 monospace; }` `[VERIFIED: index.html:122-131]`.

**Recommendation:** keep `#docked` as the station root id (so existing visibility assertions keep working) and grow it into the shell:

```
#docked (full-screen, hidden when not docked)
  <header data-field="station-header"> system name · credits </header>
  <nav data-field="station-menu">      home: Launch + F3/F5/F7/F8 entries </nav>
  <section data-screen="home|market|outfitting|status|systemData"></section>
  <footer> <span data-field="station-keys"> · <span data-field="message" role="status" aria-live="polite"> </footer>
```

- Home reuses the existing `system`/`credits`/`ship`/`fuel` fields and the launch control; the docking-computer line and `buy-dockcomp` button are **removed** (D-10 of Phase 4 says Phase 5 replaces them).
- `data-field="message"` must stay inside `#docked` so the Phase 4 launch hint still surfaces; the footer is the natural place.
- One `StationShell` controller owns visibility, the active screen, selection, pending confirm, and the `AbortController`. The session never queries the DOM.

### Screen models (pure, unit-testable in Node)

Put the projections in a pure module (e.g. `src/ui/station-model.ts`), so the math and the copy can be tested without a DOM and the shell only writes strings:

> **Superseded by 05-01 step 6 and 05-04 Task 3.** The live signatures are `buildMarketModel(market, profile, commodities, selection, feedback)` returning `{rows: {key,name,unit,price,priceText,stockText,heldText,exText,dimmed,selectable}[], cashText, loadText, selectedKey, confirmText, noticeText}` and `buildOutfittingModel(catalogue, profile, systemTechLevelRaw, selectedKey, unitByKey)`; the `pendingText`/`footerText` fields and the three-argument shape below are the earlier draft.

```ts
buildMarketModel(market, profile, commodities): {
  rows: { key; name; unit; priceDc; stock; held; illegalExport; dimmed; stockText }[];
  cashText; loadText; selectedKey; pendingText; footerText;
}
buildOutfittingModel(catalogue, profile, system): {
  rows: { key; label; priceDc; priceText; enabled; reason; owned; multiCount? }[];
  detail: { name; description; priceText };
  fuelVisible;
}
buildStatusModel(profile, system, equipmentNames): { page1: ...; page2: ...; pageIndicator }
buildSystemDataModel(system, labels): { fields: {label; value}[]; description; distanceLy }
```

`priceDc` stays an integer; formatting is `formatDecicredits(dc)` = `${Math.trunc(dc/10)}.${dc % 10} Cr` (matches Oolite's `(pricePerUnit / 10)` + `% 10` `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9665-9666]`). `formatCredits` already produces the same text for safe integers `[VERIFIED: src/sim/player/profile.ts:66-68]`; either is acceptable, but do not use float `toFixed` on a price per unit.

### F8 Market (D-06, D-08, D-09)

- Rows ordered by `sortOrder` (the compiled array already is: `[VERIFIED: tools/oolite-ingest/convert/commodities.ts:261]`).
- Columns: `Commodity`, `Unit`, `Price`, `For sale`, `In hold`, `Ex` (D-08 — note Oolite's own header order is commodity, price, for-sale, in-hold, legal, extras `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:9645-9651]`; D-08's order adds an explicit unit column, which is a Wegolite refinement).
- Price text one decimal (`3.8`, `36.9`, `1.9`); stock and hold zero render `—` (`commodity-quantity-none` = `"—"` `[VERIFIED: third_party/oolite/Config/descriptions.plist:1639]`).
- Zero stock → dimmed but still selectable? Recommendation: **selectable** (so the player can read the price) but any buy clamps to 0 and reports `noStock`; `alien_items` is **not selectable** (non-interactive, stock `—`).
- `Ex` = `legalityExport > 0` → `Ex`, otherwise `—` (or blank). The v1 set has slaves (1), narcotics (2) and firearms (1) with `legalityExport > 0` `[VERIFIED: src/content/generated/commodities.json:81,153,251]`.
- Cash/load line: `Cash: 100.0 Cr. Load 16 of 20 t.` (Oolite's template is `"Cash: [credits|dcr]. Load [currentCargo] of [cargoCapacity] t."` `[VERIFIED: third_party/oolite/Config/descriptions.plist:1635]`; D-09 uses `formatCredits`).
- The footer is the only place a confirm/clamp/result appears; there is no modal.

### F5 Status, two pages (D-04)

Oolite's field set and formats `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:7059-7080]`:

```objc
        fuel_desc = [NSString stringWithFormat:@"%.1f %@", fuel / 10.0, lightYearsDesc];
        credits_desc = OOCredits(credits);
        ...
        [gui setText:shipName forRow:0 ...];
        Present System / Hyperspace System / Condition / Fuel / Cash / Legal Status / Rating
        [gui setText:DESC(@"status-equipment") forRow:9];
```

| Field | Source | v1 value |
|-------|--------|----------|
| Commander | `PLAYER_DEFAULT_NAME` = `"Jameson"` `[VERIFIED: /home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:89]` | `Commander Jameson` (no name entry in v1) |
| Ship | `DOCKED_SHIP = "Cobra Mk III"` `[VERIFIED: src/ui/docked.ts:18]` | constant |
| Present system | `System.name` | Lave |
| Hyperspace system | none until Phase 6 | `(Unknown)` app literal (the `status-unknown-system` string is **not** compiled into `labels.json`) |
| Condition | docked | `Docked` (the first entry of descriptions.plist's `condition` list `[VERIFIED: third_party/oolite/Config/descriptions.plist:87-93]`) |
| Fuel | `profile.fuel / 10` | `7.0 Light Years` (`status-light-years-desc` is `"Light Years"`) |
| Cash | `formatCredits(profile.credits)` | `100.0 Cr` |
| Legal status | `labels.legalStatus[0]` | `Clean` `[VERIFIED: src/content/generated/labels.json:101-105]` |
| Rating | `labels.rating[0]` | `Harmless` `[VERIFIED: src/content/generated/labels.json:106-116]` |
| Equipment | profile + counts | owned keys' names, `Missile ×N`, `Passenger Berth ×N` |

Page 2 (manifest): all 16 tradeable commodities with units and held amounts (gold/platinum in kg, gem-stones in g — the explicit reason D-04 wants a manifest), plus the same `Load X of Y t` line. Do not sum kg/g into tons; `holdPodsUsed` is the only total.

Keys: `Tab`/`PageDown` next page, `PageUp` previous; `Esc`/`Backspace` home; page indicator e.g. `Page 1/2`. (Do not require `Shift+Tab`: the action map stores plain `KeyboardEvent.code` values, and a shifted `Tab` is the same code with `shiftKey` set; D-04 does not ask for it.)

### F7 System data (D-05)

All fields come from the compiled `System` record, all labels from `labels.json`:

| Field | Format | Lave value | Provenance |
|-------|--------|-----------|------------|
| Title | `sysdata-data-on-system` = `"Data on [system]"` | `Data on Lave` | `labels.json:13` |
| Economy | `labels.economy[system.economy]` | `Rich Agricultural` (index 5) | `labels.json:2-11` |
| Government | `labels.government[system.government]` | `Dictatorship` (index 3) | `labels.json:48-56` |
| Tech Level | raw + 1 | `5` (raw 4) | `PlayerEntity.m:7531`; `labels.json:45` |
| Population | `population * 0.1` to one decimal + `Billion` | `2.5 Billion` | `labels.json:36`; Lave `population: 25` |
| Inhabitants | `System.inhabitants` in parentheses | `(Human Colonials)` | `labels.json:33`; g0.json:1011 |
| Gross productivity | `${productivity} M₢` | `7000 M₢` | `labels.json:38`; g0.json:1085 |
| Average radius | `${radiusKm} km` | `4116 km` | `labels.json:40`; g0.json:1086 |
| Distance | `%.1f ly` | `0.0 ly` (current system) | `PlayerEntity.m:7584` |
| Description | `System.description` | `Lave is most famous for its vast rain forests and the Laveian tree grub.` | g0.json:1005 |

Do **not** implement a general `[key|modifier]` template expander. `labels.json` carries `sysdata-pop-value` as `"[population|multiply:0.1|precision:1] Billion"` `[VERIFIED: src/content/generated/labels.json:36]`; render the four value templates with explicit cases and unit-test them. This satisfies "labels come from labels.json" without building a template language.

Distance is the current system's distance to itself = 0.0; Phase 6 replaces it with the selected target's distance. `status-hyperspace-system`/distance are not generated prose.

### F3 Outfitting (D-10..D-16)

- Two-pane: list on the left, selected item's `description` and price on the right (D-13); the catalogue already carries both `[VERIFIED: src/content/schemas/equipment.ts:20-30]`.
- Rows in D-11 order. `sortHint` (from `purchase_sort_order`) exists only on Fuel `[VERIFIED: src/content/generated/equipment.json:105-113]`; a fixed order is simpler and deterministic.
- Display names: use catalogue `name` for ordinary items, but shorten for rows where the catalogue name is prose:
  - `Missile (2/3)` (D-14)
  - `Passenger Berth (1)` or `Passenger Berth — 5 t`
  - `Remove Passenger Berth — 100 Cr`, `Remove Missile — 20 Cr` (D-15 shows these exact short forms; the catalogue names are `"Remove Passenger Berth - reclaims 5t of cargo space"` and `"Unmount and sell all pylon mounted weapons"` `[VERIFIED: src/content/generated/equipment.json:245,330]`).
- Dim reasons (short, literal): `Requires TL N`, `Already installed`, `Not enough credits`, `Pylons full`, `No cargo space`, `Full tank`.
- Fuel row price is the fill cost (§Outfitting). Confirm copy: `Buy Fuel for 72.0 Cr? [Y/N]`.
- Reaction to `Y`: apply, refresh the header credits, keep the cursor on the row, set the footer result; autosave immediately.
- Selected rows that are disabled must not open a confirm; pressing `Enter`/`Y` on them leaves the reason visible.

### Keyboard and focus model (ECON-09)

The repo's keyboard layer maps codes to a fixed action table and fires edge commands `[VERIFIED: src/input/keyboard.ts:29-35,51-125]`. It has no notion of UI mode. Two conflicts make a naive addition unsafe:

1. `pause` is bound to `KeyP` **and** `Escape` `[VERIFIED: src/input/actions.ts:64]`. If `Esc` is also "back", one keydown fires both. The existing sub-panel workaround is a capture-phase listener that stops the event `[VERIFIED: src/app/game-session.ts:563-577]`, but that is a point fix, not a mode model.
2. `launch` is bound to `Digit1` and `F1` `[VERIFIED: src/input/actions.ts:65]`. D-03 requires `Digit1` to be inert inside a section.

**Recommended design:** add a context to the input layer rather than a second keyboard listener:

```ts
type InputContext = "flight" | "dockHome" | "dockScreen";
setContext(context: InputContext): void; // on InputState/KeyboardInputSource
```

- `ACTION_CONTEXTS` metadata in `actions.ts`: `pause` and `launch` fire in `flight` + `dockHome`; station screen actions fire in `dockHome` + `dockScreen` (so F-keys can switch directly between screens); row/quantity/page actions fire in `dockScreen` only.
- `frame()` returns zero axes when the context is not `flight`; `keyDown` filters `firing` by context before dispatching, exactly where the Shift chord filter already runs `[VERIFIED: src/input/keyboard.ts:100-123]`.
- Add new `ActionId`s (names discretion): `stationMarket` (`F8`,`Digit8`), `stationOutfitting` (`F3`,`Digit3`), `stationStatus` (`F5`,`Digit5`), `stationSystemData` (`F7`,`Digit7`), `stationBack` (`Escape`,`Backspace`, dockScreen), `stationUp`/`stationDown` (`ArrowUp`/`ArrowDown`, dockScreen), `stationLeft`/`stationRight` (`ArrowLeft`/`ArrowRight`, dockScreen), `stationConfirm` (`Enter`,`KeyY`), `stationCancel` (`KeyN`), `stationPageNext` (`Tab`,`PageDown`), `stationPagePrev` (`PageUp`).
- **Shift+Left/Right needs a new chord concept.** The current model only supports "this action *requires* Shift" (`SHIFT_REQUIRED_ACTIONS` = `dockingComputer`) `[VERIFIED: src/input/actions.ts:97-99]`; adding `stationLeft` to that set would make plain Left inert. Add a small `SHIFT_VARIANT_ACTIONS: Record<ActionId, ActionId>` (e.g. `stationLeft → stationSellMax`, `stationRight → stationBuyMax`) consulted when `mods.shift` is true, and keep `SHIFT_REQUIRED_ACTIONS` for actions that are only valid with Shift. Unit-test the resolution table: plain Left = step, Shift+Left = max sell, plain Right = step, Shift+Right = max buy.
- `createBindingMap` fills missing actions from defaults, so existing settings blobs keep working `[VERIFIED: src/input/bindings.ts:54-63]`; an older build reading a newer blob drops the blob (unknown action) — acceptable, and the same forward-compat trade-off as the save.
- `detectConflict` will report `Escape` as a conflict if a user tries to rebind; defaults are built without conflict checks, so `pause: ["KeyP","Escape"]` + `stationBack: ["Escape","Backspace"]` coexist. The context filter is what prevents double firing — **do not** rely on `stopPropagation` alone.

**Browser-reserved keys.** `F5` reloads the page, `F3` is find-again in some browsers and `F7` toggles caret browsing in Firefox. The capture-phase handler (or the keyboard source) must call `preventDefault()` for these codes; even then, browsers may reserve them. Therefore:
- `Digit3/5/7/8` are the **canonical advertised path** and `F3/F5/F7/F8` are aliases.
- A Playwright test must press `F5` and assert the app did not reload (probe still `ready`, station screen advanced, `performance.getEntriesByType("navigation").length === 1`). This is a Wave 0 proof, not an assumption.
- Never read `event.key`; use `event.code` (the repo's rule `[VERIFIED: src/input/actions.ts:6-10]`).

**Focus.** Move DOM focus to the active section root (`tabindex="-1"`, `.focus({preventScroll:true})`) when it opens so a screen reader announces it, but keep activation in the action layer. Do not rely on roving DOM focus for keyboard operation (a click on the canvas would otherwise strand the player). The station root is above the canvas and the HUD; the pause overlay (`z-index: 20` `[VERIFIED: index.html:210-212]`) stays above it.

### No-mouse proof (ECON-09)

A Playwright spec must do the whole loop with `page.keyboard.press`/`down`/`up` only: open F8, move selection, buy with Left/Shift+Left/Y, open F3, buy the cargo bay, open F5 and page, open F7, return home, launch. Assert `probe.station` state and the rendered text via `locator.textContent()`, never a screenshot.

## Determinism, Session State and Persistence

### What lives where

| State | Owner | Persisted? |
|-------|-------|-----------|
| credits, cargo, fuel, missiles, berths, unique equipment | `PlayerProfile` (beside `FlightState`) | yes, on every accepted trade/purchase |
| current market (price + stock) | `GameSession` local (`Market`) | **no** — regenerated from the persisted `marketSeed` on load; stock may reset, prices do not (D-19) |
| `marketSeed` | `GameSession` local uint32, written through `snapshotForSave` | **yes** — additive optional save field; restored or defaulted to `marketSeedForSystem` (D-18) |
| active screen, selection, pending trade | station controller (session) | no |
| clock | `FlightState` | existing (unchanged by docked screens) |

Economy state must stay out of `FlightState` so the replay hash is untouched `[VERIFIED: src/sim/player/profile.ts:7-11]`.

### Save schema extension (D-19 discretion)

Add **optional** fields to the existing strict v1 object. This keeps every Phase 4 blob valid (missing keys are simply absent), invents no migration, and lets `isEncodedSaveValid` use the same schema.

```ts
// src/persistence/save.ts (sketch)
export const MAX_SAVE_CARGO_ENTRIES = 17;
export const MAX_SAVE_COMMODITY_KEY_CHARS = 32;
export const MAX_SAVE_CARGO_QUANTITY = 36_000_000; // 35 t of grams + 499,999 safe
export const MAX_SAVE_MISSILES = 3;
export const MAX_SAVE_BERTHS = 7;
export const MAX_SAVE_FUEL = 70;

const CargoEntrySchema = z.strictObject({
  key: z.string().min(1).max(MAX_SAVE_COMMODITY_KEY_CHARS),
  quantity: z.number().int().min(0).max(MAX_SAVE_CARGO_QUANTITY),
});

export const SaveV1Schema = z.strictObject({
  // …existing version/mode/clockSeconds/credits/equipment/system/station…
  cargo: z.array(CargoEntrySchema).max(MAX_SAVE_CARGO_ENTRIES).optional(),
  fuel: z.number().int().min(0).max(MAX_SAVE_FUEL).optional(),
  missiles: z.number().int().min(0).max(MAX_SAVE_MISSILES).optional(),
  passengerBerths: z.number().int().min(0).max(MAX_SAVE_BERTHS).optional(),
});
```

- Use an **entry array**, not a record keyed by commodity. This follows the project's existing "dictionaries are entry arrays, never objects keyed by plist key" decision (STATE.md, Phase 02) and keeps `__proto__` from becoming a data key.
- `SaveAllowLists` gains `commodities: ReadonlySet<string>`; `parseSave` rejects an unknown or duplicate commodity key as `corrupt`, exactly like equipment `[VERIFIED: src/persistence/save.ts:208-214]`.
- Validate hold capacity inside `parseSave` (it has the whole save): `holdPodsUsed(cargo, unitByKey) <= capacityPods(equipment, passengerBerths)`. An over-capacity blob is `corrupt`, not silently clamped.
- Recompute/assert `passengerBerths <= 7` and `capacityPods >= 0`; a save with 7 berths on a 20 t hull is 20−35 < 0 → corrupt.
- Update the `MAX_SAVE_CHARS` derivation comment: 17 cargo entries × (32 key chars × 6 escape + 8 digits + JSON punctuation) ≈ 3,800 chars worst case, still far below 32,768. Keep the cap.
- `snapshotForSave` projects `profile.cargo` **sorted by commodity `sortOrder`** so encoding is canonical; `restoreFromSave` defaults missing fields to `cargo: {}`, `fuel: 70`, `missiles: 3`, `passengerBerths: 0` (a Phase 4 blob is a new game that had 3 missiles and a full tank).
- `restoreFromSave`'s `profileFactory(credits, equipment)` signature must change (e.g. `profileFromSave(save)`); update `game-session.ts:1054-1059` and the persistence tests.
- `newProfile()` returns the full new-game state `{ credits: 1000, equipment: [], cargo: {}, fuel: 70, missiles: 3, passengerBerths: 0 }`, with `cargo` built by a `emptyCargo()` helper that returns a null-prototype object (the project's `Object.create(null)` rule for untrusted/dynamic keys). This mechanically updates every `PlayerProfile` literal in `tests/sim/player-profile.test.ts` and `tests/persistence/*.test.ts`.

### Forward-compatibility caveat (document it)

`SaveV1Schema` is `z.strictObject` `[VERIFIED: src/persistence/save.ts:78-96]`, so an **older** build reading a **newer** v1 blob with these keys will classify it `corrupt` (numeric version present, schema fails) and New game may back it up and clear it. Adding optional fields is backward-compatible for reading old blobs but not forward-compatible for old builds reading new ones. A version bump would make old builds report `future-version` and leave the blob untouched, but it needs a v1 reader now — which D-19 assigns to Phase 6. Recommendation: keep v1 + optional fields, and record the caveat in PROJECT.md. If the team wants the safer forward-compat, the alternative is `version: 2` with a `SaveV1OrV2` union; that is a deliberate deviation from "do not invent a Phase 6 migration" and needs confirmation.

### Autosave triggers

- Accepted trade → `commitProfile(next)` then `autosave()` (same path as Phase 4's purchase `[VERIFIED: src/app/game-session.ts:354-364,430-477]`).
- Accepted equipment purchase/removal → same.
- Market generation, screen navigation, rejected trades → **no autosave** (existing tests assert exact `attempts`/`writes` after launch/dock; don't add attempts).
- `?test=1` mutations still taint and skip writes `[VERIFIED: src/app/game-session.ts:445-449]`; an e2e trade-autosave proof must use the starting 100 Cr and real UI actions, not the test seam.

## Content Shape Changes

### D-21 — commodity display names

Currently `commodity.name` is the raw token `"[commodity-name food]"` `[VERIFIED: src/content/generated/commodities.json:11]`, copied straight from the plist `[VERIFIED: third_party/oolite/Config/trade-goods.plist:6]` by the converter `[VERIFIED: tools/oolite-ingest/convert/commodities.ts:175]`. D-21 requires the display name.

Build-side change:

1. `generate.ts` already parses `descriptions.plist` `[VERIFIED: tools/oolite-ingest/generate.ts:112-126]`; pass that parsed value to `emitCommodities`.
2. In `compileCommodities(parsed, descriptions)`, build a map of top-level keys starting `"commodity-name "` → string value. For each record, require its plist `name` token to be exactly `[commodity-name ${key}]`, then resolve `commodity-name ${key}`. All 17 resolve `[VERIFIED: third_party/oolite/Config/descriptions.plist:2140-2160]`, including the underscore spellings `liquor_wines`, `gem_stones`, `alien_items`.
3. Emit the resolved string as `name`; keep `key` as identity. A missing description key is a `SCHEMA` build failure (never fall back to the token or `"Unknown Commodity"`).
4. Update `CommoditySchema` docs and the converter's comment that says name is the token.

Expected display names: Food, Textiles, Radioactives, Slaves, Liquor/Wines, Luxuries, Narcotics, Computers, Machinery, Alloys, Firearms, Furs, Minerals, Gold, Platinum, Gem-Stones, Alien Items.

### Regeneration checklist (must run in the container)

```
docker compose run --rm assets                       # regenerate src/content/generated/**
docker compose run --rm assets npm run assets:check  # drift gate must print nothing and exit 0
```

Files that change: `src/content/generated/commodities.json`, `src/content/generated/manifest.json` (SHA-256 rows), and `tests/golden/content/commodities.json` (copy from the generator output, as the existing golden was produced `[VERIFIED: tools/oolite-ingest/convert/commodities.test.ts:5-12]`). `tests/golden/content/lave.json`, equipment, ships and GLBs should be byte-identical; a change there is a red flag.

Tests that must be updated: `tools/oolite-ingest/convert/commodities.test.ts` (deep equality and the "seventeen records" expectations; add anchors for `name`, `peakExport`, `peakImport`), plus any test asserting `[commodity-name`.

## Architecture Patterns

### System architecture diagram

```
              ┌────────────────────────────── index.html ──────────────────────────────┐
              │  #docked station root: header / section / footer (DOM, textContent)     │
              └───────────────▲──────────────────────────────┬─────────────────────────┘
                              │ render(view models)          │ keydown (action layer)
                              │                              │
   content ──► loadCommodities │            ┌─────────── StationShell ────────────┐
   (zod strict) ──► Commodity[]│            │ active screen · selection · confirm │
                              │            │ one AbortController · focus         │
                              │            └───────────▲───────────┬─────────────┘
                              │                        │ calls     │ actions
                              │            ┌───────────┴───────────▼─────────────┐
                              │            │            GameSession             │
   system ─────────────────────┼──────────► │ profile · market · marketSeed        │
   (galaxy0)                   │            │ commitProfile → autosave            │
                              │            └───────┬───────────────┬────────────┘
                              │                    │ pure          │ persistence
                              │        ┌───────────▼────────┐   ┌──▼──────────────┐
                              │        │ src/sim/economy     │   │ snapshotForSave │
                              │        │ ranrot · market     │   │ SaveV1 (zod)    │
                              │        │ cargo · trade       │   │ IndexedDB       │
                              │        └───────────▲────────┘   └─────────────────┘
                              │                    │
                              │        ┌───────────┴────────┐
                              └────────┤ src/sim/player      │
                                       │ profile · outfitting│
                                       └─────────────────────┘
```

Data flow for one trade: key event → action → `StationShell` pending state → `planBuy/planSell` (pure) → footer confirm text → `Y` → `applyBuy` → `commitProfile` → `autosave` → market/status view model rebuilt → DOM `textContent`.

### Recommended project structure (new files)

```
src/sim/economy/
├── ranrot.ts          # RANROT + randf (pure, 32-bit)
├── market.ts          # generateMarket, Market, MARKET_LIMIT = 127
├── cargo.ts           # holdPodsUsed, capacityPods, pod thresholds
└── trade.ts           # planBuy/planSell/applyBuy/applySell, refusals

src/sim/player/
└── outfitting.ts      # visible set, condition rules, planFit/applyFit

src/content/
└── commodities.ts     # loadCommodities/parseCommodities (mirror equipment.ts)

src/ui/
├── station.ts         # StationShell DOM controller
└── station-model.ts   # pure view models (market/outfitting/status/sysdata)

src/app/
└── station-controller.ts  # session-side screen/selection/pending state (optional split)

tests/golden/market/
├── lave.json
├── zaonce.json
└── leesti.json
```

`src/sim/economy/**` and `src/sim/player/outfitting.ts` may import **types only** from `src/content/types.ts` (`Commodity`, `Equipment`, `System`) — the ESLint sim zone denies every runtime content import `[VERIFIED: src/content/types.ts:4-25]`. The session loads the validated records and passes them in as plain data, exactly as `FlightConfig` and `StepOptions.equipment` already do.

### Pattern 1: one trusted transaction path

**What:** UI computes a display plan, then the session re-runs the plan before applying. **When:** every buy, sell, fit, removal. **Why:** mirrors Phase 4's `buyDockComputer` defence `[VERIFIED: src/app/game-session.ts:354-362]` and prevents a stale/forged UI from minting credits. Example skeleton in §Code Examples.

### Pattern 2: immutable market, mutable-in-session profile

**What:** `Market` is a value; `applyBuy` returns a new one; `PlayerProfile` is likewise replaced through `commitProfile`. **When:** always. **Why:** autosave snapshots a single consistent object; no partial writes; tests compare by value.

### Pattern 3: view model → `textContent`

**What:** pure builder produces strings/booleans; shell writes them. **When:** every screen refresh. **Why:** avoids `innerHTML` (XSS) and keeps DOM tests unnecessary; the builder is where the ECON-01/03/06/07 assertions live. Never rebuild rows on every animation frame; rebuild on state change only (trade, fit, selection, page, screen, dock).

### Pattern 4: additive probe contract

**What:** add a `probe.station` object; never rename or remove existing fields. **When:** once, in the probe types and `updateProbe`. **Why:** earlier e2e specs read the same object; the project has already retired fields only with a documented decision `[VERIFIED: src/app/probe.ts:10-17]`.

### Anti-patterns to avoid

- **`innerHTML` for names/descriptions** — all content is `textContent` (Pitfall 16 in the repo).
- **A second global keydown listener that races the flight input** — use one context-aware layer; capture-phase interception only for browser-reserved keys.
- **Recomputing the market every frame or on every screen open** — D-17 generates on docking only; recomputing on F8 open would make stock depend on screen visits.
- **Storing market in `FlightState`** — would churn the replay hash and break determinism tests.
- **Using displayed TL for gating** — one TL too generous.
- **Treating kg/g as tons** — 1000× economy error.
- **Adding a template engine for `sysdata-*`** — four explicit value formatters are enough.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Commodity display names | A TypeScript name table or UI-side `[commodity-name x]` lookup | Build-time resolution from `descriptions.plist` (D-21) | Fidelity + drift gate; a second table silently diverges |
| Price/stock formula | A new "reasonable" economy, or the obsolete 8-bit `Commodities.plist` formula | `OOCommodities.m` port (§Economy Formula) | The project's value is fidelity; the old formula is explicitly obsolete since 1.81 |
| Randomness | `Math.random`, `crypto.getRandomValues`, `Date` | `src/sim/economy/ranrot.ts` seeded from the persisted `marketSeed` | Determinism + fixtures; ESLint already bans `Math.random` in `src/sim` `[VERIFIED: eslint.config.js:120-126]` |
| Money | floats, `toFixed` arithmetic, a decimal library | integer decicredits + integer formatter | Exact, no drift, matches Oolite's `pricePerUnit % 10` display |
| Pod accounting | "divide by 1000" or "kg goods are tons" | `floor((500 + qty)/1000)` / `floor((500000 + qty)/1_000_000)` (§Cargo) | The 499-unit "safe" is the authored rule; plain division is wrong at the boundary |
| Save validation | manual `JSON.parse` + `as` casts | zod strict schema + allow-lists (existing) | Already the project's trust boundary; keeps forged cargo/equipment out |
| Equipment conditions | A JavaScript condition-script evaluator | The five explicit rules in §Outfitting | Phase 2 D-10 deliberately does not evaluate Oolite condition scripts |
| Keyboard UI | A focus/roving-tabindex framework | one action layer + one shell handler | The repo already has semantic actions and a DOM-free input core |
| DOM rendering | `innerHTML`, a diffing library | `textContent` + targeted updates | XSS rule + no new dependency |
| Test environment | `jsdom` | Node view-model tests + Playwright probes | Avoids a devDependency and the container volume reset |

**Key insight:** every number in this phase has a provenance in the Oolite checkout or the pinned snapshot. If a plan cannot name the source line, it is inventing a rule.

## Integration Seams (exact current APIs)

| Seam | Current behaviour | Phase 5 change |
|------|-------------------|----------------|
| `src/ui/docked.ts` | `createDockedPanel(root)`; show/hide, fields, one purchase line | Grow into `#docked` station shell; remove `setDockComputer`/`onBuyDockComputer`; keep launch/credits/message |
| `src/app/game-session.ts` | `profile` local; `docked.show(system.name)` on start and `docked` event; `docked.hide()` on `launched` `[VERIFIED: src/app/game-session.ts:600-640,1156-1164]` | Load commodities; own `market` + persisted `marketSeed`; generate once at session start/dock and never re-seed on `docked`; route station actions; commit+autosave trades/fits |
| `src/sim/player/profile.ts` | `{credits, equipment}`; `canPurchase`, `purchase`, `formatCredits` `[VERIFIED: src/sim/player/profile.ts:42-45,98-145]` | Extend type; keep `canPurchase` for the single-instance TL/credits check; new `outfitting.ts` for conditions/multiplicity |
| `src/input/actions.ts` | 13 flight actions; `SHIFT_REQUIRED_ACTIONS` `[VERIFIED: src/input/actions.ts:13-70]` | Add station actions + `ACTION_CONTEXTS`; preserve defaults |
| `src/input/keyboard.ts` | `createInputState`/`createKeyboardInputSource`; edge commands `[VERIFIED: src/input/keyboard.ts:29-35]` | Add `setContext`; filter firing + zero axes outside `flight` |
| `src/persistence/save.ts` | strict v1; equipment allow-list; duplicate rejection `[VERIFIED: src/persistence/save.ts:78-96,206-222]` | Optional cargo/fuel/missiles/berths; commodity allow-list; capacity check |
| `src/persistence/autosave.ts` | `snapshotForSave(state, profile, system, station)`; `restoreFromSave(save, layout, factory)` `[VERIFIED: src/persistence/autosave.ts:38-55,91-106]` | Snapshot new profile fields; change the restore factory signature |
| `src/content/equipment.ts` | cached strict-zod loader + `findEquipment` `[VERIFIED: src/content/equipment.ts:75-109]` | Reuse unchanged; add a `commodities.ts` twin |
| `src/app/probe.ts` | live mutable probe object; `?test=1` hook `[VERIFIED: src/app/probe.ts:148-195,227-297]` | Add `probe.station`/`probe.economy`; add `test.setFuel`/`test.setMissiles` if needed (taint as usual) |
| `index.html` | `#docked` markup and terminal CSS `[VERIFIED: index.html:122-206,359-389]` | Add header/nav/section/footer; keep `#docked` id and `data-field="message"` |
| `tests/e2e/docking.spec.ts` | asserts the `buy-dockcomp` line/reason at Lave `[VERIFIED: tests/e2e/docking.spec.ts:371-401]` | Repoint to F3; delete the old line assertions |
| `tests/e2e/launch.spec.ts` | asserts `#docked` visible + message hint `[VERIFIED: tests/e2e/launch.spec.ts:30-31,139-143]` | Should still pass if `#docked` and `data-field="message"` survive; verify |
| `tests/e2e/autosave.spec.ts` | exact `attempts`/`writes` after launch/dock `[VERIFIED: tests/e2e/autosave.spec.ts:347-349]` | Do not autosave on market generation/screen changes; extend with a trade autosave test |

## Common Pitfalls

1. **Double vs float32.** Oolite computes in 32-bit `float`. A double port can truncate 1 dc differently and make goldens unreproducible against the reference table. Wrap each op in `Math.fround` in the C grouping.
2. **Consumption order.** Quantity consumes two `randf()` before price consumes two; skipping `alien_items` shifts every subsequent good. Four calls × 17 goods.
3. **Dictionary order.** Do not iterate an object/Map insertion order unless it is sorted by `sortOrder`; the compiled JSON is sorted, keep it.
4. **Bias divide-by-zero.** `peak_export == peak_import` (narcotics) returns 0 before the division. Do not compute `distance` then divide unconditionally.
5. **`-bias` for price, `+bias` for quantity.** Reversing them inverts the whole economy; the canonical Lave→Zaonce route fails.
6. **127 cap applied to stock only, after generation.** Do not cap price; do not cap before truncation.
7. **Displayed TL (+1) used for gating.** Gate on `System.techLevelRaw`; display +1. Lave raw 4 must refuse TL 5+ items.
8. **Fuel row showing 0.2 Cr.** The row price is `(70 − fuel) * 2` dc; the unit price is only in the description.
9. **Pod off-by-one.** `MAX_*_IN_SAFE` is `pod/2 − 1` (499 / 499,999), and the divisor in `cargoQuantityOnBoard` is `pod − safe − 1` (500 / 500,000). Using 500 as the threshold for "0 pods" makes 500 kg cost 0 pods.
10. **A full hold can still buy 499 kg/499,999 g.** D-07 requires it; a naive `availablePods === 0 → no purchase` rule violates it.
11. **`purchase()` rejects duplicates.** Missiles/berths must be counts, not duplicate keys, or the second purchase silently returns the same profile.
12. **Save `strictObject` + required fields.** New required keys would make every Phase 4 blob `corrupt`. Make them optional.
13. **Duplicate equipment check.** Keep `equipment` unique; do not relax `parseSave`'s duplicate rejection to encode counts.
14. **`Escape` double-fire.** `pause` already owns `Escape`; without context filtering one keydown queues both back and pause. A capture listener alone is brittle.
15. **`Digit1` launch inside F8.** D-03. The action layer must know `dockHome` vs `dockScreen`, and the session should re-check before queueing `{kind:"launch"}`.
16. **Browser F5.** A naive `F5` binding reloads the page. `preventDefault` in capture phase, `Digit5` advertised, and an e2e reload assertion.
17. **Re-render per frame.** The render loop runs while docked; rebuilding the market table every frame resets scroll and burns CPU. Render on state change.
18. **`innerHTML` for descriptions.** `System.description` and equipment descriptions are content strings; always `textContent`.
19. **Cargo object keys.** `__proto__` must never become a cargo key; validate against the commodity allow-list and use an entry array on the wire.
20. **Negative credits.** The UI must never compute `credits - cost` before the plan approves it; `apply*` re-checks.
21. **Selling past 127.** Clamp to `127 - stock`; a full market refuses that good with a reason.
22. **Market lifetime.** Regenerating on F8 open (instead of docking) makes stock depend on screen navigation and breaks D-17.
23. **Persisted `marketSeed`.** D-18/D-19 (amended 2026-11-05) persist one uint32 `marketSeed` in the save; there is no arrival counter. A new game derives `marketSeedForSystem(system.id)`, a restore uses `save.marketSeed ?? marketSeedForSystem(system.id)`, and a `docked` event never re-seeds. Phase 6 owns multi-system re-seeding.
24. **Changing `newProfile()`** breaks many existing tests/typecheck; plan a mechanical sweep of `PlayerProfile` literals.
25. **`buy-dockcomp` removal** breaks the Phase 4 browser test; update it in the same plan as the shell.
26. **`status-hyperspace-system`/`status-unknown-system` are not in `labels.json`.** Only six arrays + `sysdata-*` are compiled `[VERIFIED: src/content/schemas/labels.ts:18-26]`; use app literals or extend the labels schema deliberately (a content change).
27. **Producer/consumer drift.** Any change to `src/content/generated/**` must be regenerated in the container; `assets:check` is part of `verify` `[VERIFIED: compose.yaml:74-83]`.
28. **Probe growth.** Add fields; do not rename existing ones. Keep the probe object live and mutable, as now.

## Code Examples

### 1. Float32 economy (derived from `OOCommodities.m`, not copied)

```ts
const f = Math.fround;
const KILOGRAMS_PER_POD = 1000;
const MAX_KILOGRAMS_IN_SAFE = KILOGRAMS_PER_POD / 2 - 1; // 499
const GRAMS_PER_POD = KILOGRAMS_PER_POD * 1000; // 1_000_000
const MAX_GRAMS_IN_SAFE = GRAMS_PER_POD / 2 - 1; // 499_999
export const MARKET_LIMIT = 127;

function economicBias(economy: number, peakExport: number, peakImport: number): number {
  const exDiff = Math.abs(economy - peakExport) * 2;
  const imDiff = Math.abs(economy - peakImport) * 2;
  const distance = (exDiff + imDiff) / 2; // both even, so this is integer
  if (exDiff === imDiff) return 0;
  if (exDiff > imDiff) return f(-(1 - imDiff / distance));
  return f(1 - exDiff / distance);
}

function generate(good: Commodity, economy: number, rng: Ranrot): { price: number; stock: number } {
  const bias = economicBias(economy, good.peakExport, good.peakImport);

  let qBase = f(good.quantityAverage);
  const qEcon = f(f(qBase * f(good.quantityEconomic)) * bias);
  const qr1 = rng.randf();
  const qr2 = rng.randf();
  const qRandom = f(f(qBase * f(good.quantityRandom)) * f(qr1 - qr2));
  qBase = f(qBase + f(qEcon + qRandom));
  const stock = Math.min(qBase < 0 ? 0 : Math.trunc(qBase), MARKET_LIMIT);

  let pBase = f(good.priceAverage);
  const pEcon = f(f(pBase * f(good.priceEconomic)) * f(-bias));
  const pr1 = rng.randf();
  const pr2 = rng.randf();
  const pRandom = f(f(pBase * f(good.priceRandom)) * f(pr1 - pr2));
  pBase = f(pBase + f(pEcon + pRandom));
  const price = pBase < 0 ? 0 : Math.trunc(pBase);

  return { price, stock };
}
```

The explicit `r1`/`r2` locals make the **left-to-right** consumption order part of the code rather than an evaluation-order accident; the fixtures pin it.

### 2. RANROT port

```ts
export function createRanrot(seed: number): { randf(): number } {
  let high = (~seed) >>> 0;
  let low = seed >>> 0;
  const next = (): number => {
    high = (((high << 16) + (high >>> 16)) >>> 0) + low;
    high = high >>> 0;
    low = (low + high) >>> 0;
    return high & 0x7fffffff;
  };
  next(); next(); next(); // MakeRanrotSeed's three mix rounds
  return { randf: () => ((next() & 0xffff) * (1 / 65536)) };
}
```

### 3. Pod accounting

```ts
export function podsFor(unit: CommodityUnit, quantity: number): number {
  if (unit === "t") return quantity;
  const podSize = unit === "kg" ? KILOGRAMS_PER_POD : GRAMS_PER_POD;
  const safe = unit === "kg" ? MAX_KILOGRAMS_IN_SAFE : MAX_GRAMS_IN_SAFE;
  // Oolite: ((podSize - safe - 1) + quantity) / podSize, integer division
  return Math.trunc((podSize - safe - 1 + quantity) / podSize);
}
```

### 4. Equipment conditions (the five v1 rules)

```ts
type FitRefusal =
  | "techLevel" | "owned" | "maxInstances" | "cargoSpace"
  | "pylonsFull" | "nothingToRemove" | "insufficientCredits"
  | "fullFuel" | "invalidPrice";

function conditionRefusal(item: Equipment, profile: PlayerProfile, ctx: FitContext): FitRefusal | null {
  const c = item.conditions;
  if (item.key === "EQ_FUEL" && profile.fuel >= ctx.fuelCapacity) return "fullFuel";
  if (c["requires_empty_pylon"] === "true" && profile.missiles >= ctx.missileCapacity) return "pylonsFull";
  if (c["requires_mounted_pylon"] === "true" && profile.missiles === 0) return "nothingToRemove";
  if (c["requires_free_passenger_berth"] === "true" && profile.passengerBerths === 0) return "nothingToRemove";
  const requiredSpace = Number(c["requires_cargo_space"] ?? 0);
  if (requiredSpace > 0 && ctx.availablePods < requiredSpace) return "cargoSpace";
  return null;
}
```

Coerce `conditions` values defensively: the generated record carries strings (`"true"`, `"5"`) and numbers (`damage_probability: 0`) `[VERIFIED: src/content/generated/equipment.json:3-12,305-320]`.

### 5. Save schema extension

See §Determinism, Session State and Persistence for the full sketch. The one structural rule: **optional** fields on the strict v1 object, cargo as an entry array, allow-listed commodity keys.

### 6. Context-aware action dispatch

```ts
// actions.ts
export type InputContext = "flight" | "dockHome" | "dockScreen";
export const ACTION_CONTEXTS: Readonly<Record<ActionId, readonly InputContext[]>> = {
  pitchForward: ["flight"], /* … */
  pause: ["flight", "dockHome"],
  launch: ["flight", "dockHome"],
  stationMarket: ["dockHome", "dockScreen"],
  stationBack: ["dockScreen"],
  /* … */
};

// keyboard.ts keyDown, where the Shift chord is already resolved:
const firing = candidates.filter((a) => ACTION_CONTEXTS[a].includes(context));
```

`Esc` then means pause only on home or in flight, and back only inside a screen.

## State of the Art

| Old approach | Current approach | When changed | Impact here |
|--------------|------------------|--------------|-------------|
| 8-bit `Commodities.plist` price formula (wiki) | `OOCommodities.m` economy-only formula | Oolite 1.81+ | Port the current formula only; `FEATURES.md` §B documents the same |
| 8-bit stock table / hand-authored prices | Generated `trade-goods.plist` coefficients + triangular random | Oolite 1.81+ | 127 cap, same buy/sell price, no price impact |
| Treating money as floats | Integer decicredits | project decision | exact arithmetic, one-decimal render |
| `localStorage` for saves | IndexedDB + strict versioned schema | Phase 4 (PROJECT.md) | additive optional fields keep v1 readable |
| Positional/`event.key` keyboard handling | `KeyboardEvent.code` semantic actions | Phase 3 (FLGT-07) | layout-independent; required for F-key handling |
| Screenshot/pixel evidence | `window.__wegolite` probes + console errors | Phase 1 decision | station proofs are numeric/state assertions |

**Deprecated/outdated:**
- Oolite's obsolete 8-bit commodity formula (wiki page) — do not port.
- Oolite's equipment install delay (`600 + price` seconds) and mass-dependent fuel pricing — explicitly out of v1 (D-12).
- Oolite's "bargain tech days" TL discount — depends on a day clock; out of v1.
- The Phase 4 single `buy-dockcomp` line — replaced by F3.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | The computed reference fixture values (Lave/Zaonce/Leesti) will be regenerated from the implementation; they are not repo output | Economy Formula | Low — fixtures are ours; a mismatch means the implementation or the emulation order differs and must be reconciled before pinning |
| A2 | `Math.fround` per operation is the right emulation of Oolite's `float`; a double implementation is acceptable only if fixtures are generated from it | Economy Formula / Pitfalls | Medium — a 1 dc drift vs the reference table; no requirement failure because the goldens are ours, but fidelity is weaker |
| A3 | Missile removal refunds 300 dc per missile and charges 200 dc (net +700 dc for 3), as core Oolite does | Outfitting | Medium — a visible money rule; if the team wants the simpler "charge 20 Cr, lose missiles", it must be recorded as a deviation |
| A4 | Fuel is persisted in the v1 save (optional field), although D-19 names only cargo and credits | Persistence | Medium — buying fuel then reloading would otherwise lose credits-worth of fuel; Phase 6 owns fuel persistence, but writing it now is additive |
| A5 | Passenger berths reduce total capacity by 5 t each, applied after the cargo bay's +15 t | Cargo | Low — verified against Oolite `changePassengerBerths` and `equipment_weight` exclusion |
| A6 | `PlayerProfile` is extended with `cargo`/`fuel`/`missiles`/`passengerBerths` rather than a sibling `ShipState` | Outfitting / Persistence | Low — keeps one persisted object and `snapshotForSave` signature; costs a mechanical test sweep |
| A7 | F5 hyperspace target shows an app literal `(Unknown)` and F7 distance shows `0.0 ly` until Phase 6 | Station Screens | Low — Phase 6 replaces both; no content-schema change |
| A8 | F3 removal rows use short app labels (`Remove Passenger Berth — 100 Cr`) rather than the long catalogue names | Station Screens | Low — D-15's examples are authoritative; ordinary rows use catalogue names |
| A9 | New game starts with 3 missiles and a full 70-unit tank; a Phase 4 blob without the new fields restores those defaults | Persistence | Low — matches Oolite's starting Cobra; affects Continue of old blobs only |
| A10 | The browser permits `preventDefault()` to suppress F5/F3/F7 defaults (at least in Chromium), with `Digit` keys as the reliable path | Station Screens | Medium — if F5 cannot be suppressed, the F-key alias is unusable in that browser; the number keys still satisfy ECON-09 |
| A11 | No `jsdom` is added; DOM wiring is proven by Playwright, pure view models by Node | Standard Stack / Validation | Low — saves a dependency and a volume reset; a later phase can add it |

**If this table were empty:** no user confirmation would be needed. It is not, but A3, A4 and A10 are now settled in §Open Questions (RESOLVED), and D-10/D-15 are the binding decisions.

## Open Questions (RESOLVED)

1. **Missile-removal money rule (A3). — RESOLVED 2026-11-05: adopt Oolite's trade-in.** D-10/D-15 were amended by the owner: the missile-removal entry charges 200 dc and refunds the full catalogue value of every mounted missile (300 dc each, net +700 dc at three; berth removal stays 1000 dc with no refund). Plan 05-03 implements it with exact-delta tests and records it in PROJECT.md; the earlier charge-only reading is superseded.
2. **Fuel persistence (A4). — RESOLVED: fuel is a persisted optional v1 field.** Plan 05-01 adds `fuel` (0..70) beside cargo/credits so a buy-then-reload cannot lose a credits-worth of fuel; it remains additive and Phase 6's SAVE-02 can extend it.
3. **Market seed on Continue (D-18/D-19). — RESOLVED 2026-11-05: persist one `marketSeed`.** Plan 05-01 adds the optional additive `marketSeed`; the boot uses `restore.marketSeed ?? marketSeedForSystem(system.id)`, a `docked` event reuses the in-memory market, and a reload regenerates identical prices from the persisted seed while stock may reset. There is no `probe.economy.arrival` field and no arrival counter. Plan 05-06's reload case asserts the seed and all 17 prices are unchanged. Oolite itself re-rolls on load from a time-seeded RNG; the persisted seed is a deliberate modernisation.
4. **F-key suppression (A10). — RESOLVED: proven in the browser, Digit keys advertised.** Plan 05-05 asserts `performance.getEntriesByType("navigation").length === 1` after `page.keyboard.press("F5")`; the capture-phase listener cancels the reserved codes and the footer advertises the Digit aliases.
5. **Save forward-compatibility. — RESOLVED: accept the caveat.** Plan 05-01/05-02 use optional additive fields (no `version: 2` union, no migration), and plan 05-02 records in PROJECT.md that an older build sees a newer v1 blob as corrupt.
6. **New-game missile count. — RESOLVED: 3 missiles.** `newProfile()` sets `missiles: 3` and a field-less Phase 4 blob restores the same default; D-14 caps purchases at 3, so F3 shows `Missile (3/3)` dimmed with `Pylons full` until one is removed.
7. **Does the Phase 5 UI need a `UI-SPEC.md`? — RESOLVED: no blocking spec.** `check ui-plan-gate` reports `block: false`; the plans follow the existing terminal tokens (`#33ff66` on black, monospace, 18px/1.7) and D-02's chrome, so no separate UI-SPEC is produced for this phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Docker | every command | ✓ | 29.8.2 | — |
| Docker Compose | service orchestration | ✓ | 5.6.0 | — |
| Node/npm | container-internal only | ✓ (inside image) | image-pinned | never use host Node |
| Playwright Chromium | e2e | ✓ (baked in image) | image-pinned | — |
| `tsx` | `assets:build`/`assets:check` | ✓ (`devDependencies`) | 4.23.15 | — |
| New npm package | — | ✗ | — | **none needed**; do not add one |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

The phase is code/config-only; no service, database or runtime tool is added.

## Validation Architecture

> `workflow.nyquist_validation: true` and `security_enforcement: true`, ASVS level 1 `[VERIFIED: .planning/config.json]`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (Node `unit` project) + Playwright 1.64.1 `[VERIFIED: package.json, vitest.config.ts, playwright.config.ts]` |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `docker compose run --rm test npx vitest run tests/sim/economy tests/sim/player tests/ui --passWithNoTests` |
| Full suite command | `docker compose run --rm test` |
| Browser suite | `docker compose run --rm e2e` (builds, then `npm run test:e2e`) |
| Phase gate | `docker compose run --rm verify` (lint → typecheck → assets:check → test → build → e2e) `[VERIFIED: compose.yaml:74-83]` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ECON-01 | Exact price/stock for Lave/Zaonce/Leesti at `marketSeedForSystem`; 127 cap; economy-only | unit + golden + drift | `docker compose run --rm test npx vitest run tests/sim/economy`; `docker compose run --rm assets npm run assets:check` | ❌ Wave 0 (`tests/sim/economy/market.test.ts`, `tests/golden/market/*.json`) |
| ECON-02 | Same price both ways; price unchanged by trades; integer dc | unit | `… vitest run tests/sim/economy/trade.test.ts` | ❌ Wave 0 |
| ECON-03 | 20/35 t; 499/500 kg and 499,999/500,000 g boundaries; full-hold safe | unit | `… vitest run tests/sim/economy/cargo.test.ts tests/sim/economy/trade.test.ts` | ❌ Wave 0 |
| ECON-04 | F8 columns/units/dimming/`—`/Alien Items; quantity + confirm | unit + e2e | `… vitest run tests/ui`; `docker compose run --rm e2e` | ❌ Wave 0 (`tests/ui/station-market.test.ts`, `tests/e2e/station.spec.ts`) |
| ECON-05 | TL/price/conditions; single vs multi; removals | unit + e2e | `… vitest run tests/sim/player/outfitting.test.ts`; e2e | ❌ Wave 0 |
| ECON-06 | F5 identity/fuel/credits/equipment; page 2 units | unit + e2e | `… vitest run tests/ui/station-status.test.ts`; e2e | ❌ Wave 0 |
| ECON-07 | F7 economy/gov/TL+1/pop/productivity/radius/distance/description | unit + e2e | `… vitest run tests/ui/station-system-data.test.ts`; e2e | ❌ Wave 0 |
| ECON-08 | Clamp + reason for stock/credits/hold/market-full; never negative | unit + property | `… vitest run tests/sim/economy/trade.test.ts` | ❌ Wave 0 |
| ECON-09 | Keyboard-only full loop; F5 no reload; Digit1 inert in sections | e2e + input unit | `docker compose run --rm e2e`; `… vitest run tests/input` | ❌ Wave 0 (`tests/e2e/station.spec.ts`, `tests/input/station-actions.test.ts`) |
| (content) | Names resolved; peaks emitted; no token; drift clean | golden + drift | `… vitest run tools/oolite-ingest/convert/commodities.test.ts`; `assets:check` | ⚠️ exists, must update |
| (save) | Old v1 blob parses; cargo/fuel/missiles/berths round-trip; forged key/over-capacity corrupt | unit + e2e | `… vitest run tests/persistence`; `tests/e2e/autosave.spec.ts` | ⚠️ exists, must update |
| (guards) | sim stays DOM/Three/content-free | guard | `… vitest run tests/guards` | ✅ exists |

### Sampling Rate

- **Per task commit:** the touched unit file(s) in the container (e.g. `docker compose run --rm test npx vitest run tests/sim/economy/market.test.ts`).
- **Per wave merge:** `docker compose run --rm test` + `docker compose run --rm typecheck` + `docker compose run --rm lint` + `docker compose run --rm assets npm run assets:check`.
- **Phase gate:** `docker compose run --rm verify` green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/sim/economy/market.test.ts` — formula, bias, 127 cap, float32 truncation, generation order, seed reproducibility, fixture comparison.
- [ ] `tests/sim/economy/cargo.test.ts` — pod thresholds, capacity with cargo bay/berths, full-hold safe.
- [ ] `tests/sim/economy/trade.test.ts` — buy/sell clamps, refusal reasons, same price both ways, integer credits, never negative (add a fast-check property for random cargo/credit combos).
- [ ] `tests/sim/player/outfitting.test.ts` — visible set, TL gate, conditions, multi-instance, removals, fuel price.
- [ ] `tests/golden/market/{lave,zaonce,leesti}.json` — 17 rows each, `{version, systemId, marketSeed, goods}`; generated by the implementation, compared exactly.
- [ ] `tests/helpers/commodities.ts` — Node `readFileSync(new URL("../../src/content/generated/commodities.json", import.meta.url))` helper so economy tests use the committed values, not a `?raw` Vite import (the existing content tests use the same read pattern).
- [ ] `tests/ui/station-market.test.ts`, `tests/ui/station-outfitting.test.ts`, `tests/ui/station-status.test.ts`, `tests/ui/station-system-data.test.ts` — pure view models.
- [ ] `tests/input/station-actions.test.ts` — context filtering, Escape not double-firing, Digit1 inert in `dockScreen`, Shift chords.
- [ ] `tests/e2e/station.spec.ts` — keyboard-only loop, F5 no reload, probe assertions, console-error collection.
- [ ] `src/content/commodities.ts` + a parse test — there is **no commodity loader today** (`src/content/` has equipment/ships/dock-port/systems/index only).
- [ ] Extend `tests/persistence/save.test.ts` and `tests/persistence/autosave.test.ts` for the optional fields; add an over-capacity corruption case.
- [ ] Update `tools/oolite-ingest/convert/commodities.test.ts` + `tests/golden/content/commodities.json`.
- [ ] Update `tests/e2e/docking.spec.ts` (the `buy-dockcomp` test) and verify `launch.spec.ts` still passes.
- [ ] Extend `src/app/probe.ts`: `probe.station` + `probe.economy`; optional `test.setFuel`/`test.setMissiles` (tainted, never persisted).
- [ ] No framework install; Vitest/Playwright and their container images already exist.

### Evidence shapes (probe-only, no pixels)

```ts
probe.station = {
  open: boolean,
  screen: "home" | "market" | "outfitting" | "status" | "systemData",
  page: number,                 // 1-based, F5
  selectedKey: string | null,
  pending: { side: "buy" | "sell"; key: string; amount: number; text: string } | null,
  message: string,              // footer
};
probe.economy = {
  credits: number,
  fuel: number,
  missiles: number,
  passengerBerths: number,
  cargo: Record<string, number>,
  holdPods: number,
  capacityPods: number,
  marketSeed: number,
  market: { key: string; price: number; stock: number }[],
  lastTrade: { side: "buy" | "sell"; key: string; amount: number; cost: number } | null,
};
```

e2e assertions read these values and `locator.textContent()`; they never diff screenshots and always fail on a collected `console.error` (QUAL-08 direction).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | single-player static client, no accounts |
| V3 Session Management | no | — |
| V4 Access Control | partial | `?test=1` hook is the only privileged surface; it mutates live state only and marks taint, so it can never become a durable save `[VERIFIED: src/app/game-session.ts:445-449]` |
| V5 Input Validation | **yes** | zod strict save/content schemas; commodity/equipment allow-lists; non-negative integer bounds; `KeyboardEvent.code` allow-list; `textContent` only |
| V6 Cryptography | no | no secrets; do not invent save signing — it is not a security boundary |
| V8 Data Protection | yes (light) | save carries no timestamps, host data or PII |
| V12 Files/Resources | partial | IndexedDB quota/blocked/unavailable handled non-fatally (existing) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered save sets negative/huge credits, unknown cargo keys, impossible hold or berths | Tampering | Strict schema + range caps + commodity/equipment allow-lists + `holdPodsUsed <= capacityPods`; reject as `corrupt` |
| Duplicate cargo/equipment keys make restore ambiguous | Tampering | Reject duplicates in `parseSave` (existing equipment rule, extended to cargo) |
| XSS via commodity/equipment/system strings rendered into the station | Elevation | Every dynamic write is `textContent`; no `innerHTML` |
| Prototype pollution via `__proto__` as a cargo key | Tampering | Cargo is an entry array on the wire; runtime map built from allow-listed keys only |
| Integer overflow / float drift in money | Tampering | `Number.isSafeInteger` guards, integer dc arithmetic, reject non-safe values, never subtract before approval |
| Browser shortcut hijack (F5 reload, F7 caret) | Denial of service (local) | `preventDefault` in capture phase, `Digit` keys advertised, e2e reload assertion |
| `?test=1` used to mint credits/cargo in production | Elevation | Query-param only; live state only; tainted profiles never autosave |
| Huge DOM/JSON allocation from a forged save | DoS | `MAX_SAVE_CHARS` before `JSON.parse`; bounded arrays; no unbounded template expansion |
| Market generation looping or dividing by zero on malformed content | DoS | Content is build-validated; bias returns 0 before division; `sortOrder` uniqueness is a build check |

## Sources

### Primary (HIGH confidence)
- `/home/opencode/git/oolite/src/Core/OOCommodities.m` — `generateQuantityForGood` :383-396, `generatePriceForGood` :398-411, `economicBiasForGood` :431-452, market generation order/cap :261-278 — read this session.
- `/home/opencode/git/oolite/src/Core/OOCommodities.h:29` — `MAIN_SYSTEM_MARKET_LIMIT 127`.
- `/home/opencode/git/oolite/src/Core/legacy_random.c` — `Ranrot` :87-93, `RanrotWithSeed` :95-103, `MakeRanrotSeed` :105-116, `randf` :142-145.
- `/home/opencode/git/oolite/src/Core/Universe.m:7173-7191` — `setSystemTo:` destroys and regenerates the market.
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m` — `tryBuyingCommodity` :9993-10062, `trySellingCommodity` :10074-10124, `cargoQuantityOnBoard` :9508-9545, fuel price :8386-8387, berth capacity :9396-9407, missile removal :9326-9329 + `doTradeIn` :9431-9437, status screen :7059-7080, system data :7531-7541, distance :7584, market price format :9665-9666, techlevel :8226, bargain days :8275-8285, `PLAYER_DEFAULT_NAME` :89.
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.h:278-283` — `PLAYER_MAX_FUEL 70`; `:1294-1297` — pod constants.
- `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m` — `maxAvailableCargoSpace`/`availableCargoSpace` :7198-7214, equipment conditions :3057-3078.
- `/home/opencode/git/oolite/Resources/Scripts/oolite-equipment-control.js:65-70` — cargo bay enable/disable adjusts `cargoSpaceCapacity`.
- Repo files read or searched this session: `src/content/schemas/{commodity,equipment,system,labels,ship}.ts`, `src/content/{equipment,ships,systems,types,index}.ts`, `src/content/generated/{commodities,equipment,labels}.json`, `src/content/generated/ships.json`, `src/content/generated/systems/g0.json`, `src/ui/docked.ts`, `src/app/{game-session,probe,boot,hints}.ts`, `src/input/{actions,keyboard,bindings}.ts`, `src/sim/{hash,commands}.ts`, `src/sim/player/profile.ts`, `src/persistence/{save,autosave}.ts`, `src/settings/schema.ts`, `index.html`, `compose.yaml`, `vitest.config.ts`, `playwright.config.ts`, `package.json`, `eslint.config.js`, `tools/oolite-ingest/{generate.ts,convert/commodities.ts,convert/commodities.test.ts}`, `tests/persistence/*.test.ts`, `tests/e2e/{docking,launch,autosave}.spec.ts`, `.planning/config.json`.

### Secondary (MEDIUM confidence)
- `.planning/phases/05-docked-economy-station-screens/05-CONTEXT.md` (D-01..D-21), `.planning/REQUIREMENTS.md` (ECON-01..09), `.planning/ROADMAP.md` §Phase 5, `.planning/research/FEATURES.md` §A–§G, `.planning/phases/02-data-pipeline-content-compiler/02-CONTEXT.md` (D-24, D-25), `.planning/phases/04-manual-docking/04-CONTEXT.md` (D-10, D-15).
- `third_party/oolite/Config/{trade-goods,equipment,descriptions,keyconfig,keyconfig2}.plist` (vendored pinned snapshot).

### Tertiary (LOW confidence)
- Computed reference fixture tables and the float32/RANROT seed choice — `[ASSUMED]`, to be regenerated by the implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependency; the existing toolchain covers everything.
- Oolite formula and cargo/equipment rules: HIGH — read line-by-line from the checkout this session, cross-checked against the canonical examples.
- Content shape (names/peaks): HIGH — the gap is proven in the schema, converter and generated JSON; the plist has the values.
- Station-shell/keyboard design: MEDIUM — new design over verified seams (existing `DockedPanel`, action map, capture-phase precedent); browser F-key suppression needs an e2e proof.
- Persistence extension: MEDIUM — additive optional fields are safe for old blobs; the forward-compat caveat and the fuel decision need acceptance.
- Fixtures: MEDIUM — formula verified, numbers computed (not repo output).

**Research date:** 2026-11-05
**Valid until:** 2026-12-05 (stable; re-check if the Oolite snapshot pin, `CommoditySchema`, `SaveV1Schema` or `src/ui/docked.ts` changes)

