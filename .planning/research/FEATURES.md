# Feature Research

**Domain:** Browser-based faithful reimplementation of Oolite's core single-player trading/navigation loop
**Researched:** 2026-11-02
**Confidence:** HIGH for Oolite mechanics and data (read from Oolite's own config/source); MEDIUM for scope judgements (opinionated calls about what preserves "feel")

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Cobra Mk III flight model (pitch/roll, no yaw) | This is the physical feel of Elite/Oolite. Yaw or Newtonian drift instantly reads as "not Elite". | HIGH | Port `oolite_template_cobra3-player`: `max_flight_speed = 350`, `thrust = 32`, `max_flight_pitch = 1`, `max_flight_roll = 2`, `max_cargo = 20`, `fuel = 70`. Acceleration is `SHIP_THRUST_FACTOR (5.0) × thrust = 160 u/s²`; speed approaches the w/s target at that rate. Turn rates ramp at 2 rad/s² roll and 4 rad/s² pitch, with 4× faster reversal when reversing the stick. Flight is Aristotelian (velocity is forward speed only), not Newtonian. |
| Launch from a Coriolis station | The game starts docked; the first verb is "launch". | MEDIUM | Docked state, `1`/`F1` launches. Oolite adds 10 minutes to the ship clock on launch, spawns you in the slot with the station's spin (`launchRoll = -station roll`), then a short break-pattern transition. Station roll is `0.08 rad/s` (Coriolis), so the slot is visibly rotating. |
| In-system scene and navigation | After a jump there must be a planet, sun, station, nav buoy and witchpoint to fly between; the compass/scanner need real targets. | MEDIUM | Minimum core bodies: sun, main planet, main station in orbit, navigation buoy in front of the dock, witchpoint buoy at the hyperspace arrival point. No asteroids, rock hermits, or NPC traffic required. System positions/radii come from `planetinfo.plist` (`planet_distance`, `sun_distance`, `station_vector`, `radius`). |
| Torus jump drive (in-system cruise) | Witchpoint-to-station distances are minutes of real time at 350 m/s; without the torus drive the loop is unplayable. | MEDIUM | `j` toggles. Base factor 32×, rising with distance to the nearest object: `32 × sqrt(distance / (4 × 25.6 km))`, capped at 1024×. Mass-locked by nearby ships/stations/planets (in v1 effectively station/planet). This is not optional polish; it is core navigation. |
| Manual docking | The skill/tension centrepiece of the original loop and explicitly locked in scope. | HIGH | Approach from in front of the slot, align the slot horizontally, match the station's roll, enter at moderate speed. Oolite docks you when the ship's bounding box is inside the port and 90% past the port plane. Misalignment scrapes and pushes the ship back; crossing opposite edges at once is fatal. Coriolis hull is ~1000 m across; dock corridor is 250 m deep; the dock mesh bounding box is ~103 × 242 × 250 (verify orientation in-engine; Oolite widens the effective gate for wide ships). |
| Hyperspace jump | The only way to reach a second market; locked in scope. | MEDIUM | Target selected on the chart, `h` starts a 15 s countdown (abortable). Checks: not current system, distance ≤ 7.0 LY, fuel ≥ cost. Cost is `10 × max(0.1, distance)` fuel units, where 70 units = 7.0 LY, so a 5.6 LY jump costs 56 units. Jump advances the clock by `distance²` hours. Arrival is at the destination's witchpoint, not the station. |
| Galactic chart (short-range + long-range) | Players must see where they can go and what the target system is like. | MEDIUM | 256 systems per galaxy at integer coordinates 0–255; Oolite draws connection lines between systems ≤ 7 LY apart. Show current system, selected target, distance in LY, fuel cost, and a fuel-range circle. Short-range is centred on the current system; long-range shows the whole galaxy. Target selection drives `h`. |
| 17-commodity market with Oolite's price/quantity rules | The economy is the reason the trading loop exists; invented prices break route knowledge. | HIGH | Data-driven from `trade-goods.plist`. Prices and stock are generated from the system's **economy only** (0–7), not tech level/government/population/productivity. Formula details and all 17 goods are in the reference appendix. Stock cap is 127 per good. Buy and sell at the same displayed price; trades do not move the price. |
| Market screen and trade transactions | The primary station interface; players expect the Oolite column layout. | MEDIUM | Columns: Commodity, Extras, Price, For Sale, In Hold, Legal. Bottom line: cash and cargo load. Buy 1 / buy max, sell 1 / sell max. Buying is limited by stock, credits, and cargo space; selling is limited by hold and station capacity (can't flood past 127). |
| Cargo hold and manifest | Trading is meaningless without capacity and a visible hold. | MEDIUM | Cobra base 20 t; Large Cargo Bay adds +15 t (`extra_cargo = 15`) → 35 t. Gold/platinum are kg and gem-stones are g: 1000 kg or 1,000,000 g per ton pod; 499 kg / 499,999 g fit in the "safe" without consuming a pod. Treating these as 1 unit = 1 t destroys the economy (a ton of gold is ~38,800 Cr). |
| Outfitting screen and equipment purchase | Locked scope includes equipment; the docking computer must be buyable. | MEDIUM | Item list with name, price, install time; info pane. Availability = item in the Cobra's `optional_equipment` list (or `available_to_all`) AND station tech level ≥ item tech level AND `canAddEquipment` (cargo space, incompatibilities, prerequisites). No equipment resale in core Oolite. Fuel is a special row priced for the missing amount only. |
| Ship status screen | The "who am I / what do I own" screen; locked in scope. | LOW | Commander name, ship name, present system, hyperspace target, condition, fuel (LY, one decimal), cash (one decimal), legal status, rating, equipment list. v1 can omit legal/rating lines or show neutral placeholders; keep fuel/cash/equipment/system/target. A second page shows the cargo manifest. |
| Save/resume in the browser | Locked scope; without it a browser game is a demo. | MEDIUM | Oolite saves only while docked (autosave on launch when enabled). Persist at minimum: galaxy index, system index, target system, credits (decicredits), fuel, cargo amounts, owned equipment, max cargo, ship clock, commander/save name, data version. Recommend snapshotting the current market too (see appendix: Oolite rerolls the main market on reload). |
| Authentic starting state | The community will immediately check "do I start at Lave with 100 Cr in a Cobra III?". | LOW | Galaxy 0, system 7 (Lave, coords 20,173), Cobra Mk III, 100.0 Cr (1000 decicredits), full 7.0 LY fuel, 20 t hold, forward pulse laser, 3 missiles (missiles cosmetic only in v1). Lave is Rich Agricultural, Dictatorship, raw TL 4 (displayed TL 5). |
| Flight HUD (v1 subset) | The HUD is the cockpit; its absence reads as a tech demo. | MEDIUM | Keep: crosshair, scanner (25.6 km range), compass (planet → station, plus witchpoint), aegis indicator, speed bar, roll bar, pitch bar, fuel bar, clock, message line, condition light, scanner zoom. Drop combat-only dials: shields, energy, cabin/weapon temperature, missiles, target reticle, weapons-offline text, MFDs. |
| Docking computer as a buyable assist | Locked scope; also the intended escape hatch from manual docking difficulty. | MEDIUM | `EQ_DOCK_COMP`, TL 9, 1500 Cr. `c` engages a slow autopilot that requests clearance, flies the approach and docks; `c` again aborts. `Shift+C` instant-docks at main stations (main stations always set `allows_fast_docking = true`) and adds 20 minutes to the clock. v1 can ship instant dock first and the scripted autopilot immediately after. |
| Pause, options, and remappable input | Desktop browser players expect to pause and configure controls. | LOW | `p` pause. Keep input behind an abstraction (keyboard now; gamepad/touch later). Settings that matter for v1: pitch invert, mouse control toggle, sensitivity, fullscreen, save-slot management. |
| Data ingestion from Oolite config | "Ported from Oolite's config files rather than invented" is a project requirement; it is also the cheapest fidelity win. | MEDIUM | Build-time conversion of `planetinfo.plist` (2048 systems), `trade-goods.plist`, `equipment.plist`, `shipdata.plist` (Cobra/Coriolis templates), `shipyard.plist` (Cobra optional equipment), `descriptions.plist` (names, economy/government strings), `hud.plist`, `keyconfig.plist` to typed JSON/TS. Do not parse plists at runtime. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dual-mode docking computer with clearance ritual | Reproduces the actual Oolite ritual: watch the ship request permission, line up and slide in, or pay the clock cost for instant docking. | MEDIUM | `c` = autopilot approach (target station or main station); `Shift+C` = fast dock where allowed (+20 min). Autopilot should request clearance, fly to a point in front of the slot, match roll, and enter. With no NPC traffic, the path can be a simple scripted approach. |
| Docking clearance protocol (optional, default off) | The ritual of requesting permission and getting a window adds station-life flavour at low cost. | LOW | Oolite's code defaults clearance on if the key is absent, but the shipped `planetinfo.plist` universal block sets `stations_require_docking_clearance = no`, so current Oolite master is effectively off by default (wiki/readthedocs still say "on since 1.81" — the data wins). Implement as an option: `L` request, immediate grant, 2-minute window, warning if entering without. No fines in v1. |
| System data screen (F7) | Lets players inspect economy/government/TL/population/productivity before committing to a route; makes the galaxy feel authored. | LOW | All fields already exist in `planetinfo.plist`, including per-system descriptions. Layout: economy, government, displayed tech level, population (raw × 0.1 billion), inhabitants, gross productivity, radius, distance, description. |
| Advanced Navigational Array route plotting | Turns the chart into a route planner (fewest jumps / least time), which is the natural progression reward for a trader. | MEDIUM | `EQ_ADVANCED_NAVIGATIONAL_ARRAY`, TL 6, 2250 Cr. Route search over the 7 LY graph, minimising jumps or `distance²` time. Also enables chart economy/government/TL filters. Without it, chart works but shows only direct jumps. |
| Advanced Space Compass | Target cycling (planet, station, sun, witchpoint, selected target) is genuinely useful when the station is hidden behind the planet. | LOW | `EQ_ADVANCED_COMPASS`, TL 7, 650 Cr. Basic compass (free) only tracks planet then station; advanced adds modes. |
| All 8 galaxies and the one-way galactic ring | "8 galaxies" is part of the Oolite identity and the chart data already covers all 2048 systems. | LOW–MEDIUM | Galactic Hyperdrive (`EQ_GAL_DRIVE`, TL 10, 5000 Cr, one-shot). `g` jumps to the next galaxy, wrapping 7→0, no fuel. Destination is the nearest connected system to the current coordinates in the new galaxy. Legal status resets (irrelevant in v1). |
| Time simulation: jump/launch/dock/outfitting clocks | Small details that make the world feel simulated rather than menu-driven. | LOW | Jump time = `distance²` hours; launch +10 min; fast dock +20 min; equipment install time defaults to `600 + price` seconds. Display a ship clock. No time-critical content in v1, so this is flavour plus a foundation for v2 missions. |
| Mass-dependent fuel price | A subtle Oolite detail: a laden Cobra pays more to refuel. Rewards keeping reserve fuel. | LOW | Base 0.2 Cr per 0.1 LY, multiplied by a rate of `0.65 × shipMass/baseMass + 0.35`, clamped 0.33–3.0. Full tank from empty ≈ 14 Cr unladen. |
| Multiple save slots + export/import JSON + autosave | Browser-native convenience without a backend; protects against localStorage loss. | LOW–MEDIUM | Autosave on launch (Oolite behaviour), manual save while docked, named slots, download/upload JSON. No cloud. |
| Input and accessibility options | Desktop-only v1 still benefits from pitch invert, mouse flight, sensitivity, and remapping; same abstraction enables touch later. | LOW–MEDIUM | Oolite supports mouse control (`Shift+M`, X = roll), Ctrl precision modifier, and full key remapping. Keep actions semantic (`pitchUp`, `rollLeft`, `hyperspace`) rather than key codes. |
| Deterministic seeded PRNG for market generation | Makes economy tests reproducible and enables replay/debug fixtures; players still get a fresh roll per arrival. | LOW | Seed per system visit (or per save) and use the same seed for all 17 goods. Do not use `Math.random()` scattered through the economy module. |
| Authentic presentation layer (CRT/HUD typography, scanner tails) | The look is a large part of "feels like Oolite" and is cheap relative to simulation work. | MEDIUM | Green vector HUD, elliptical scanner with vertical tails, planet/station wireframe or low-poly models from Oolite assets (CC BY-NC-SA), docking tunnel break pattern. Do not let presentation work precede flight/docking correctness. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Combat, shields, energy banks, weapons, missiles | "It's Elite, where are the pirates?" | Pulls in damage, energy recharge, hit detection, AI, targeting, death/respawn, and balance. It is a second game, not a feature. v1 is explicitly proving flight/navigation/economy first. | Ship a peaceful trade simulator; add combat as v2 with its own milestone. Keep the Cobra's pulse laser as a model detail only. |
| NPC traffic and AI | Empty space can feel lifeless. | NPCs require spawning, AI, collision, docking queues, mass-lock interactions, and performance work; they also invalidate "empty space" test assumptions. | Use celestial bodies, station rotation, and the scanner for life. Add a small number of non-interactive ambient ships only after v2 AI exists. |
| Legal status, bounty, police, fines | Illegal goods and smuggling are core Elite fantasy. | Needs market monitoring, patrol spawning, scanning, fines, fugitive docking refusal, and reputation. Without police it is bookkeeping with no teeth. | Show market legality flags (`Ex`/`Im`/`Re`) as information, but do not implement consequences in v1. |
| Missions, contracts, passengers, parcels | Gives the player goals. | Requires destinations, deadlines, reputation, contract UI, cargo-space reservations, and failure states; all depend on a mature economy and clock. | Let the trade loop be the goal. Add contracts in v1.x only after the loop is validated. |
| Shipyard / buying other ships | Oolite's F3 has a shipyard; players expect progression. | Requires multiple ship models, stats, trade-in valuation, equipment transfer rules, and rebalancing the whole economy. The Cobra is the canonical start. | Fixed Cobra Mk III in v1; equipment progression only. |
| OXPs / scripting / mod support | The Oolite community lives on OXPs. | Explicitly excluded by the project premise; a scripting API is a platform project, not a game feature. | Publish the data schema and keep systems data-driven for future internal expansions, but no runtime mod loading. |
| Multiplayer, accounts, cloud saves, backend | "Play with friends / sync saves." | Violates the static-client, no-backend constraint and adds auth, cheating, and operational cost. | Local saves + export/import JSON. |
| Mobile/touch controls in v1 | "Browser game should work on phones." | Touch flight and a 17-row market UI need separate design; scope is desktop. | Keep input/UI behind abstractions so touch can be added later without rewriting the simulation. |
| Audio and music | Atmosphere; docking music is iconic. | Deferred by the project; asset licensing, autoplay policies, and mixing add scope before the loop is proven. | Silent v1; design an audio event bus (launch, dock, hyperspace, purchase) so sound can be dropped in later. |
| Dynamic supply/demand and price impact from trades | "Realistic economy." | Oolite's core market does **not** move price when you buy/sell; stock is capped and prices are fixed for the visit. Dynamic pricing destroys learned routes and makes the 17-good table unrecognisable. | Keep the Oolite formula exactly. Only stock quantity changes with trades. |
| Save anywhere / mid-flight save | Convenience. | Oolite saves only docked; mid-flight save requires serialising the whole in-system world (positions, timers, market state) and removes docking risk. | Save at stations only; autosave on launch; optionally a "suspend" snapshot that resumes at the station. |
| Yaw, Newtonian drift, free-look aiming | "Modernise the flight model." | Directly contradicts the locked no-yaw decision and the original feel. Newtonian physics changes combat/navigation balance and makes docking trivial or impossible. | Pitch/roll only, Aristotelian velocity, fixed forward crosshair. Ctrl precision modifier instead of yaw. |
| Fuel scoops, sun skimming, fuel injectors, afterburner | Fuel management depth. | Requires solar heat/damage, scoop physics, fuel fractions, and a reason to leave the station without fuel. v1 fuel is a jump budget. | Fuel from station only; full tank 14 Cr; plan jumps on the chart. |
| Interstellar space, misjumps, Thargoids, wormholes | Iconic Elite moments. | All are combat/edge-case content requiring special systems, spawn tables, and failure handling. | Normal-space jumps only; no misjump chance in v1. |
| Trade-profit optimiser, price database, quest markers | "Quality of life." | Oolite deliberately gives you a chart and a market, not a solver. A profit overlay removes the exploration/knowledge loop and makes the economy a spreadsheet. | Let players take notes; optionally a local "visited prices" notebook as a v2 differentiator, clearly not automatic route solving. |
| Autodock without buying the computer | New-player accessibility. | Removes the equipment progression and the reason to earn 1500 Cr; also undermines manual docking as a skill. | Manual docking is always available; offer a clear tutorial and the purchasable computer. |
| Rebalancing starting credits or prices for convenience | "100 Cr and 20 t is a grind." | Breaks fidelity with Oolite/Elite and invalidates known routes. The grind is the game's pacing. | Keep 100 Cr; improve onboarding (a short "how to trade" briefing) instead of changing numbers. |

## Feature Dependencies

```
Oolite config data (systems, commodities, equipment, ship stats)
    ├──requires──> Market generation ──requires──> Docked state ──requires──> Dock/launch
    ├──requires──> Outfitting catalog ──requires──> Docked state
    ├──requires──> Chart data ──requires──> Hyperspace targeting
    └──requires──> Save schema

Flight model
    └──requires──> Launch ──requires──> In-system flight
                            ├──requires──> Torus jump drive (playable travel time)
                            └──requires──> Manual docking ──requires──> Docked state

Docked state
    ├──requires──> Station screens (market, outfitting, status, chart, save)
    └──requires──> Save/load

Equipment ownership
    ├──requires──> Docking computer ──requires──> Docking + autopilot approach
    ├──requires──> Large Cargo Bay ──enhances──> Trading capacity
    ├──requires──> Advanced Nav Array ──enhances──> Chart
    └──requires──> Galactic Hyperdrive ──enhances──> 8-galaxy traversal

Hyperspace ──requires──> Chart target + fuel + new-system market generation
Market ──requires──> Cargo capacity + credits + commodity data
```

### Dependency Notes

- **Everything requires the data layer.** Systems, commodities, equipment and ship stats must be ingested and typed before any screen or simulation is built. This is the lowest-risk first phase because it is pure TypeScript and unit-testable without rendering.
- **Market requires docked state, but not flight.** The market screen and transactions can be built and tested before docking exists (start the player docked). Do not let this reorder the roadmap into "economy first, flight later": the core value is the full launch → fly → dock → trade run, so market UI should follow or accompany flight/docking, not replace it.
- **Hyperspace requires the chart, fuel, and market generation.** Arriving in a system must regenerate that system's market (`setSystemTo` in Oolite does exactly this), so the hyperspace phase cannot be completed before market generation exists.
- **Manual docking requires the flight model and station scene.** Docking is the hardest coupling: input, collision, station rotation, camera, and dock state must all agree. Keep it as its own phase after launch/flight.
- **Docking computer requires equipment ownership + docking + an autopilot path.** Instant dock also depends on the main-station `allows_fast_docking` flag. Build it after manual docking is solid; it is an assist, not a replacement.
- **Save requires every state model it serialises.** If credits, cargo, fuel, equipment or location are still in ad-hoc globals, save will calcify the wrong schema. Define the save schema in the data phase and extend it per phase.
- **Chart requires no flight, but hyperspace does.** The chart screen can be built from data alone; the jump can only be tested once arrival/market generation exists.
- **Galactic Hyperdrive enhances, not gates, the 8 galaxies.** All 8 charts can be present in data from day one; only inter-galactic travel needs the item.
- **Torus drive conflicts with nothing, but is required by pacing.** It is the one "travel convenience" that is not an anti-feature because Oolite itself has it and the alternative is minutes of empty flying.
- **No combat conflicts with the HUD.** The default `hud.plist` includes shields/energy/missiles; using it unmodified would show inert combat instruments. A v1 HUD variant is a dependency of the no-combat decision.

### Recommended build order

| Phase | Build | Why here | Exit criterion |
|-------|-------|----------|----------------|
| 1 | Data + economy core: ingest all Oolite config, typed system/commodity/equipment/ship models, deterministic price/quantity functions, cargo/credit math, save schema | Pure TypeScript, no rendering; every later phase depends on these numbers | Unit tests reproduce the commodity table, Lave/Zaonce example prices, jump distances and stock caps |
| 2 | Flight + launch + in-system scene + HUD + torus | Proves the "fly" half of the core value and the riskiest feel-sensitive code early | Player launches from Lave, flies with pitch/roll only, finds the station via compass/scanner, torus cruises |
| 3 | Manual docking + docked state | Hardest coupling (input, collision, station rotation, camera); must be solid before screens depend on "docked" | A human can dock manually; failed approaches bounce/scrape; docked state opens the station UI |
| 4 | Station screens + trading: market, outfitting, status, manifest | Now that "docked" exists, the economy loop can be played end-to-end at one station | Buy/sell changes credits, stock and hold exactly per formula; equipment purchase changes ship state |
| 5 | Chart + hyperspace: short/long chart, target, countdown, fuel, arrival, market regeneration | Closes the loop; depends on market generation and system scene | Lave → Zaonce → Lave round trip with correct fuel, clock, prices and stock |
| 6 | Save/load + autosave + slots | Every state model now exists; schema can be finalised | Reload restores exact credits, fuel, cargo, equipment, system and (optionally) market |
| 7 | Polish: docking computer autopilot, F7, ANA, advanced compass, gal drive, accessibility, performance | Enhances a working loop; does not block validation | v1.0 checklist complete; 60 fps target met |

The ordering rule is simple: **data → flight → docking → screens → travel → persistence → polish**. Anything that needs "docked" comes after docking; anything that needs a second market comes after hyperspace; anything that needs the full state comes after the state models settle.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Data pipeline: all 8 galaxies / 2048 systems, 17 commodities, Cobra + Coriolis stats, v1 equipment, descriptions — the source of truth for every number.
- [ ] Deterministic economy module: Oolite price/quantity formula, stock cap 127, buy/sell transactions, cargo capacity (including kg/g pods).
- [ ] Cobra flight model + launch from Lave: pitch/roll only, speed control, 160 u/s² acceleration, 350 max speed, station spin on launch.
- [ ] In-system scene: sun, Lave, Coriolis station, nav buoy, witchpoint; scanner + compass.
- [ ] Torus drive with mass lock — otherwise the first jump arrival is a 20-minute flight.
- [ ] Manual docking with slot alignment, station-roll matching, collision feedback, and docked transition.
- [ ] Docking computer purchase and instant dock (`Shift+C`, +20 min); slow autopilot if schedule allows.
- [ ] Station screens: F8 market, F3 outfitting, F5 status, F6 chart; F2 save/load.
- [ ] Hyperspace: chart target, 15 s countdown, 7 LY/70-unit fuel rules, arrival at witchpoint, clock advance.
- [ ] Save/resume at stations (localStorage), autosave on launch, one manual slot minimum.
- [ ] HUD subset and pause/options with semantic input actions.

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] F7 system data screen — cheap, data already present, improves route decisions.
- [ ] Advanced Navigational Array route plotting + chart filters — progression reward.
- [ ] Advanced Space Compass — quality-of-life target cycling.
- [ ] Full slow-autopilot docking with approach path and clearance ritual — if instant-only shipped.
- [ ] Galactic Hyperdrive + all-8-galaxy traversal — completes the "8 galaxies" promise.
- [ ] Multiple save slots, export/import JSON, save metadata (system, cash, playtime).
- [ ] External/aft views for docking alignment; mouse flight and remapping presets.
- [ ] Mass-dependent fuel pricing and equipment install-time clock advances.
- [ ] Tutorial/onboarding overlay: launch, torus, compass, docking, first trade run.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Combat, shields/energy, weapons, missiles, damage and death — the v2 milestone.
- [ ] NPC traffic, pirates, police, escorts, docking queues — depends on AI and combat.
- [ ] Missions, contracts, passengers, parcels, ranking, legal status — depend on combat + mature economy.
- [ ] Shipyard and multiple playable ships — requires models, trade-in valuation, balance.
- [ ] Fuel scoops, sun skimming, injectors, afterburner — fuel-system depth.
- [ ] Interstellar space, misjumps, Thargoids, wormholes — edge-case content.
- [ ] Audio/music and mobile/touch — deferred by project constraints.
- [ ] OXPs/scripting — explicitly never in this project's definition.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Data ingestion (systems/commodities/equipment/ships) | HIGH | MEDIUM | P1 |
| Oolite market generation + trading transactions | HIGH | MEDIUM | P1 |
| Cargo hold, manifest, kg/g pod accounting | HIGH | MEDIUM | P1 |
| Cobra flight model (pitch/roll/no yaw) | HIGH | HIGH | P1 |
| Launch from Coriolis | HIGH | MEDIUM | P1 |
| In-system scene (sun/planet/station/buoy/witchpoint) | HIGH | MEDIUM | P1 |
| Torus jump drive + mass lock | HIGH | MEDIUM | P1 |
| Manual docking | HIGH | HIGH | P1 |
| Hyperspace jump + countdown + fuel | HIGH | MEDIUM | P1 |
| Galactic chart (short/long range, target selection) | HIGH | MEDIUM | P1 |
| Market screen (F8) | HIGH | MEDIUM | P1 |
| Outfitting screen + fuel/cargo bay/dock computer | HIGH | MEDIUM | P1 |
| Ship status screen (F5) | MEDIUM | LOW | P1 |
| Save/load at station + autosave | HIGH | MEDIUM | P1 |
| HUD subset + pause/options | HIGH | MEDIUM | P1 |
| Docking computer instant dock | HIGH | LOW | P1 |
| Docking computer slow autopilot | MEDIUM | MEDIUM | P2 |
| Docking clearance protocol (optional) | LOW | LOW | P2 |
| System data screen (F7) | MEDIUM | LOW | P2 |
| Advanced Navigational Array route plotting | MEDIUM | MEDIUM | P2 |
| Advanced Space Compass | MEDIUM | LOW | P2 |
| Galactic Hyperdrive + 8-galaxy travel | MEDIUM | LOW–MEDIUM | P2 |
| Multiple save slots + export/import | MEDIUM | LOW | P2 |
| Mass-dependent fuel pricing | LOW | LOW | P2 |
| External/aft views, mouse flight, remapping presets | MEDIUM | LOW–MEDIUM | P2 |
| Tutorial / onboarding | HIGH | MEDIUM | P2 |
| Combat/NPCs/missions/legal status | HIGH (for v2) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Oolite (desktop reference) | Classic Elite (1984) | Endless Sky (open-source Elite-like) | Our Approach |
|---------|----------------------------|----------------------|--------------------------------------|--------------|
| Flight model | Pitch/roll (yaw added 1.66), Aristotelian speed, torus drive | Pitch/roll only, torus drive | 2D top-down, Newtonian-ish thrust | Cobra pitch/roll only, Aristotelian, torus drive — closest to Classic Elite with Oolite numbers |
| Docking | Manual slot alignment + rotating station; docking computer (slow + instant) | Manual slot alignment; docking computer | Automatic landing when close | Manual docking preserved; buyable computer with both behaviours |
| Economy | 17 goods, economy-only price formula, 127 stock cap, no price impact | 17 goods, 8-bit economy formula | Many goods, dynamic local economies, missions | Exact Oolite `trade-goods.plist` formula and stock rules |
| Galaxy | 8 × 256 systems, 7 LY limit, one-way galactic ring | 8 × 256 systems, 7 LY limit | Hand-authored map, many systems | Oolite's 2048 systems and coordinates, 7 LY graph |
| Progression | Credits → equipment → ships → combat rank | Credits → equipment → ships → rating | Credits → ships/outfits → story | Credits → v1 equipment only (cargo bay, computer, compass/ANA, gal drive) |
| Persistence | Desktop save files, docked only | Tape/disk save, docked only | Local save files | Browser localStorage/IndexedDB, docked only, export/import |
| Scope | Everything + OXPs | Core loop + combat | Trading/combat/missions | Core trading/navigation loop, no combat/NPCs/OXPs |

## Oolite Mechanics Reference (planning inputs)

This appendix is deliberately concrete: a planner should be able to turn each row into a data file or acceptance test without re-deriving Oolite. All values are from Oolite `master` config/source unless marked otherwise.

### A. The 17 commodities

Source: `Resources/Config/trade-goods.plist`, names from `descriptions.plist`, legality semantics from the Elite Wiki `Trade-goods (abridged)` page.

| # | Key | Display name | Unit | Avg price | Base stock | Cheapest at (peak export) | Dearest at (peak import) | Export legality |
|---|-----|--------------|------|-----------|------------|---------------------------|--------------------------|-----------------|
| 1 | `food` | Food | t | 5.0 Cr | 13.5 | 7 Poor Agricultural | 0 Rich Industrial | 0 |
| 2 | `textiles` | Textiles | t | 7.1 Cr | 15 | 7 Poor Agricultural | 0 Rich Industrial | 0 |
| 3 | `radioactives` | Radioactives | t | 23.1 Cr | 16 | 7 Poor Agricultural | 0 Rich Industrial | 0 |
| 4 | `slaves` | Slaves | t | 15.2 Cr | 9.75 | 7 Poor Agricultural | 0 Rich Industrial | 1 (illegal export) |
| 5 | `liquor_wines` | Liquor/Wines | t | 29.1 Cr | 20 | 7 Poor Agricultural | 0 Rich Industrial | 0 |
| 6 | `luxuries` | Luxuries | t | 90.2 Cr | 27.5 | 0 Rich Industrial | 7 Poor Agricultural | 0 |
| 7 | `narcotics` | Narcotics | t | 51.2 Cr | 32 | 0 (both peaks) | 0 (both peaks) | 2 (illegal export) |
| 8 | `computers` | Computers | t | 81.8 Cr | 8.5 | 0 Rich Industrial | 7 Poor Agricultural | 0 |
| 9 | `machinery` | Machinery | t | 56.0 Cr | 22.5 | 0 Rich Industrial | 7 Poor Agricultural | 0 |
| 10 | `alloys` | Alloys | t | 38.8 Cr | 29 | 0 Rich Industrial | 7 Poor Agricultural | 0 |
| 11 | `firearms` | Firearms | t | 69.2 Cr | 1 | 0 Rich Industrial | 7 Poor Agricultural | 1 (illegal export) |
| 12 | `furs` | Furs | t | 70.4 Cr | 27.5 | 7 Poor Agricultural | 0 Rich Industrial | 0 |
| 13 | `minerals` | Minerals | t | 12.0 Cr | 58 | 7 Poor Agricultural | 0 Rich Industrial | 0 |
| 14 | `gold` | Gold | kg | 38.8 Cr/kg | 9 kg | 7 Poor Agricultural | 0 Rich Industrial | 0 |
| 15 | `platinum` | Platinum | kg | 71.8 Cr/kg | 13.5 kg | 7 Poor Agricultural | 0 Rich Industrial | 0 |
| 16 | `gem_stones` | Gem-Stones | g | 19.6 Cr/g | 6.75 g | 7 Poor Agricultural | 0 Rich Industrial | 0 |
| 17 | `alien_items` | Alien Items | t | 43.6 Cr | 0 | 0 Rich Industrial | 7 Poor Agricultural | 0 |

Critical details:

- **Alien Items have zero stock in the core game.** `quantity_average`, `quantity_economic` and `quantity_random` are all 0, so every main station generates 0 for sale. They are only obtainable by scooping in Oolite; v1 cannot buy or sell them. Keep the row for completeness, but expect an empty line.
- **Gold, platinum and gem-stones are fractional tons.** One pod = 1000 kg (gold/platinum) or 1,000,000 g (gem-stones). 499 kg / 499,999 g fit in the "safe" without consuming a pod; crossing that threshold consumes a pod. Price is per kg/g, so one ton of gold is ~38,800 Cr. Do not model these as 1 unit = 1 t.
- **Only three goods are export-illegal:** slaves (1), narcotics (2), firearms (1). No core good is import-illegal. Oolite applies `legality_export × units` as an offender mark when leaving a monitored station; v1 shows the `Ex` flag but has no legal consequences.
- Sorting is by `sort_order` (100, 200, … 1700), which is the table order above.

### B. Price and quantity generation (the exact core formula)

Oolite 1.81+ no longer uses the old 8-bit `commodities.plist` formula (the wiki's `Commodities.plist` page is obsolete and should not be ported). The current formula is `OOCommodities.m`:

```
bias = economicBias(good, economy)       // +1 = ideal exporter, -1 = ideal importer, 0 = neutral

price_dc = trunc(
    price_average
  + price_average * price_economic * (-bias)
  + price_average * price_random * (randf() - randf())
)

quantity = trunc(
    quantity_average
  + quantity_average * quantity_economic * bias
  + quantity_average * quantity_random * (randf() - randf())
)
quantity = clamp(quantity, 0, 127)        // MAIN_SYSTEM_MARKET_LIMIT = 127
```

`economicBias` uses the raw economy index 0–7 and the good's `peak_export` / `peak_import` indices:

```
exDiff = abs(economy - peak_export) * 2
imDiff = abs(economy - peak_import) * 2
distance = (exDiff + imDiff) / 2          // integer division
if exDiff == imDiff: return 0
if exDiff > imDiff:  return -(1 - imDiff / distance)   // closer to importer => negative
else:                return 1 - exDiff / distance      // closer to exporter => positive
```

Key properties:

- **Only economy affects price and stock.** Tech level, government, population, productivity and radius do not enter the formula. They affect equipment availability, flavour text, and (in full Oolite) piracy/legal behaviour.
- **The random term is triangular**, not uniform: `randf() - randf()` has range (-1, +1) with a peak at 0. `price_random` is a fraction of average (e.g. food 0.04 = ±0.2 Cr), while narcotics is 1.0 = ±100%.
- **Prices are stored in decicredits** (integer tenths of a credit) and truncated toward zero. Display divides by 10 with one decimal.
- **Buy and sell use the same price.** There is no bid/ask spread. Buying removes stock; selling adds stock up to 127; neither changes the price.
- **Stock is generated per arrival, not persisted for the main market.** `Universe setSystemTo:` destroys and regenerates the market on every jump. Buying/selling persists only for the current visit.
- **Selling can be blocked by station capacity.** If station stock is already 127, you cannot sell that good there.

Worked examples (all ignoring the small random term, using `OOCommodities.m` exactly):

| System | Economy | Good | Bias | Expected price | Expected stock |
|--------|---------|------|------|----------------|----------------|
| Lave | 5 Rich Agricultural | Food | +0.429 | 3.82 Cr/t | ~16 t |
| Lave | 5 Rich Agricultural | Computers | −0.429 | 90.21 Cr/t | 0 t |
| Zaonce | 1 Average Industrial | Computers | +0.714 | 67.78 Cr/t | ~43.5 t |
| Zaonce | 1 Average Industrial | Food | −0.714 | 6.96 Cr/t | ~8.5 t |
| Any | any | Narcotics | 0 always | 0–102.4 Cr/t | 0–64 t |

The canonical first run is therefore: buy Food at Lave (~3.8 Cr), sell at Zaonce (~7.0 Cr), buy Computers at Zaonce (~67.8 Cr), sell at Lave (~90.2 Cr). Twenty tons of computers is ~448 Cr profit before randomness — enough to make the 1500 Cr docking computer a real goal, not a formality. Note that Lave's food stock is only ~16 t, less than the Cobra's 20 t hold, so the first outbound run often cannot fill the hold; that is normal Oolite behaviour, not a bug.

### C. Economies, governments, systems and tech levels

**Economy IDs** (this order matters; it is not monotonic in "agricultural-ness"):

| ID | Name |
|----|------|
| 0 | Rich Industrial |
| 1 | Average Industrial |
| 2 | Poor Industrial |
| 3 | Mainly Industrial |
| 4 | Mainly Agricultural |
| 5 | Rich Agricultural |
| 6 | Average Agricultural |
| 7 | Poor Agricultural |

Note that 5 is Rich Agricultural, before Average (6) and Poor (7). `peak_export` / `peak_import` reference these IDs directly, so e.g. food's peaks are 7 and 0 (the two ends of the line).

**Government IDs:**

| ID | Name |
|----|------|
| 0 | Anarchy |
| 1 | Feudal |
| 2 | Multi-Government |
| 3 | Dictatorship |
| 4 | Communist |
| 5 | Confederacy |
| 6 | Democracy |
| 7 | Corporate State |

**System data ranges** (from `planetinfo.plist`, 2048 systems):

| Field | Range | Display rule |
|-------|-------|--------------|
| `techlevel` | 0–14 | Displayed as raw + 1 (1–15). Equipment gating uses the raw value. |
| `economy` | 0–7 | Name from table above. |
| `government` | 0–7 | Name from table above. |
| `population` | 8–64 | Tenths of a billion; display `raw × 0.1` with one decimal (0.8–6.4 billion). |
| `productivity` | 768–56320 | Display as `M₢` (gross productivity). |
| `radius` | 2817–6911 | Kilometres. |
| `coordinates` | 0–255 per axis | Integer chart coordinates, 256 systems per galaxy, 8 galaxies. |

**Tech-level trap:** the system data screen displays `TL + 1`, but `setGuiToEquipShipScreen` compares the raw `techlevel` against the equipment's raw `minTechLevel`. If you use the displayed number for equipment availability you will be one TL too generous. Port the raw value and apply the display offset only in the UI.

### D. Flight model and controls

Cobra Mk III player template (`oolite_template_cobra3-player`, inherits `oolite_template_cobra3`):

| Property | Value | Meaning |
|----------|-------|---------|
| `max_flight_speed` | 350 | Top speed in world units/s (treat as m/s). |
| `thrust` | 32 | Acceleration input; actual accel = `5 × 32 = 160 u/s²`. |
| `max_flight_pitch` | 1 | Max pitch rate in rad/s (~57°/s). |
| `max_flight_roll` | 2 | Max roll rate in rad/s (~115°/s). |
| `max_cargo` | 20 | Tons; +15 with Large Cargo Bay. |
| `max_energy` | 256 | Combat stat; not used in v1. |
| `fuel` | 70 | Tenths of a light year (7.0 LY). |
| `max_missiles` / `missiles` | 4 / 3 | Cosmetic in v1. |
| `forward_weapon_type` | `WEAPON_PULSE_LASER` | Cosmetic in v1. |
| Hull size | 130 × 35 × 81 m | From the Cobra model bounding box. |

Turn behaviour (`ShipEntity applySticks:`): stick input sets a target rate; the current rate chases it at `2 rad/s²` for roll and `4 rad/s²` for pitch, and reversal is 4× faster. This ramp is why Oolite turns feel weighty rather than binary. Speed chases the w/s target at 160 u/s² in both directions; there is no inertia.

Default flight controls (`keyconfig.plist`; v1 keeps the semantic actions, not necessarily the exact keys):

| Action | Key | Notes |
|--------|-----|-------|
| Pitch forward (dive) | ↑ | Counterintuitive: up arrow noses down. |
| Pitch back (climb) | ↓ | Down arrow noses up. |
| Roll left / right | ← / → | Roll anticlockwise / clockwise. |
| Increase / decrease speed | `w` / `s` | Sets target speed, not instantaneous velocity. |
| Precision modifier | `Ctrl` | Hold for finer turn authority; useful for docking. |
| Torus jump drive | `j` | Toggle; mass-locked near objects. |
| Hyperspace | `h` | 15 s countdown; abortable. |
| Galactic hyperspace | `g` | Requires Galactic Hyperdrive. |
| Autopilot / docking computer | `c` | Slow approach; `c` again aborts. |
| Fast dock | `Shift+C` | Instant at main stations; +20 min clock. |
| Target station (ident) | `r` | Needed to choose a non-main station for autopilot. |
| Cycle compass mode | `\` | Advanced compass adds modes. |
| Scanner zoom / reset | `z` / `Z` | Optional in v1. |
| Launch (docked) | `1` or `F1` | |
| Status / chart / system data / market | `5`/`6`/`7`/`8` or `F5`–`F8` | |
| Outfitting / save-load | `3`/`2` or `F3`/`F2` | |
| Pause | `p` | |
| External view | `v` | Optional in v1. |
| Mouse control toggle | `Shift+M` | X = roll, Y = pitch; optional. |

**No yaw.** Current Oolite has yaw (`,`/`.`), but the locked design is Elite-style pitch/roll only. Do not add a yaw axis "for accessibility"; use the Ctrl precision modifier and a larger dead zone instead.

### E. Fuel, hyperspace, chart and time

- **Fuel capacity:** 70 units = 7.0 LY. Display `fuel / 10` with one decimal.
- **Jump cost:** `10 × max(0.1, distance)` units. Distance is quantised to 0.4 LY, so costs come in 4-unit steps: 0.4 LY = 4 units, 5.6 LY = 56 units, 7.0 LY = 70 units. A jump shorter than 0.1 LY still costs 1 unit.
- **Distance formula** (`legacy_random.h`):

```
dx = x1 - x2
dy = (y1 - y2) / 2        // integer division, truncates toward zero
dist = (int)sqrt(dx*dx + dy*dy)
ly = 0.4 * dist
```

This is why a system at ~7.15 "true" LY can be reachable and reported as 6.8 LY. Reproduce the integer truncation exactly; using `hypot` will change the galaxy's connectivity.

- **Maximum range:** 7.0 LY (`MAX_JUMP_RANGE`).
- **Countdown:** 15 s (`DEFAULT_HYPERSPACE_SPIN_TIME`), display "witchspace in N seconds", abortable; checks for current system, range, fuel.
- **Jump time:** `distance²` hours added to the ship clock. 5.6 LY = 31.36 h; 7.0 LY = 49 h. This is non-linear and surprising; it is used for route-time displays.
- **Arrival:** at the destination's witchpoint (a buoy), not the station. The player must torus/ cruise to the planet and station.
- **Galactic jump:** `g`, requires one-shot `EQ_GAL_DRIVE`, consumes it, no fuel, advances to galaxy `(current + 1) mod 8`. Standard behaviour picks the nearest system to the current coordinates that is connected to system 0 in the new galaxy, so the player is not stranded. All 8 galaxies are a one-way ring.
- **Chart connectivity:** draw an edge between two systems when the 0.4 LY formula gives ≤ 7.0. The chart is a graph, not a distance field; do not draw lines based on Euclidean pixel distance.
- **Chart modes:** short range centred on the current system (7 LY neighbourhood), long range whole galaxy. Show current system, target, distance, fuel cost, and fuel-range circle. Advanced Nav Array adds multi-jump route search (fewest jumps or least `distance²` time) and filters.

Test fixtures from Galaxy 0 (use these as chart/jump unit tests):

| Route | Coordinates | Distance | Fuel cost | Jump time |
|-------|-------------|----------|-----------|-----------|
| Lave → Diso | (20,173) → (11,174) | 3.6 LY | 36 | 12.96 h |
| Lave → Leesti | (20,173) → (13,186) | 3.6 LY | 36 | 12.96 h |
| Lave → Zaonce | (20,173) → (33,185) | 5.6 LY | 56 | 31.36 h |
| Lave → Riedquat | (20,173) → (3,181) | 6.8 LY | 68 | 46.24 h |
| Lave → Tibedied | (20,173) → (2,90) | 17.6 LY | unreachable | — |

### F. Cargo, credits and the v1 equipment set

- **Credits are decicredits internally.** `credits = 1000` at start = 100.0 Cr. All config prices are decicredits; display with one decimal. Use integer decicredits for all transactions to avoid floating-point money.
- **Starting hold:** 20 t, empty. Large Cargo Bay (`EQ_CARGO_BAY`, TL 1, 400 Cr) adds `extra_cargo = 15` → 35 t.
- **Cargo pod accounting:** tons for ordinary goods; kg/g goods consume pods only at the 1000 kg / 1,000,000 g boundaries. A market row's "For Sale" and "In Hold" units must match the commodity unit (t/kg/g), not always tons.
- **Station stock cap:** 127 units per good. Selling is rejected/limited when it would exceed capacity.

v1-relevant equipment (from `equipment.plist`; tech levels are raw, prices decicredits → credits):

| Item | Key | TL | Price | Effect / notes |
|------|-----|----|-------|----------------|
| Fuel | `EQ_FUEL` | 0 | 0.2 Cr per 0.1 LY | Only sold for the missing amount; hidden when full. Full tank from empty ≈ 14 Cr; price scales with ship mass (0.33–3.0×). |
| Large Cargo Bay | `EQ_CARGO_BAY` | 1 | 400 Cr | +15 t. |
| Docking Computers | `EQ_DOCK_COMP` | 9 | 1500 Cr | Enables `c` autopilot and `Shift+C` fast dock. |
| Galactic Hyperdrive | `EQ_GAL_DRIVE` | 10 | 5000 Cr | One-shot; `g` to next galaxy. |
| Advanced Space Compass | `EQ_ADVANCED_COMPASS` | 7 | 650 Cr | Target cycling. |
| Advanced Navigational Array | `EQ_ADVANCED_NAVIGATIONAL_ARRAY` | 6 | 2250 Cr | Route plotting and chart filters; `available_to_all`. |
| Fuel Scoops | `EQ_FUEL_SCOOPS` | 5 | 525 Cr | Excluded from v1 (no sun-skimming). |
| Escape Pod | `EQ_ESCAPE_POD` | 6 | 1000 Cr | Excluded (no death/combat). |
| Extra Energy Unit | `EQ_ENERGY_UNIT` | 8 | 1500 Cr | Excluded (no energy model). |
| Pulse/Beam/Mining/Military Laser | various | 3–10 | 400–6000 Cr | Excluded (no combat). Starting pulse laser is cosmetic. |
| Shield Boosters / Military Shield | various | 10/13 | 14750/47550 Cr | Excluded (no shields). |

Cobra Mk III `optional_equipment` includes cargo bay, ECM, fuel scoops, passenger berth, escape pod, energy unit, docking computer, all lasers, fuel injection, scanner targeting, multi-target, gal drive, advanced compass, shield boosters, heat shield. It does **not** list ANA, but ANA is `available_to_all` so it still appears. In v1, filter the catalog to functional items rather than showing inert combat equipment.

**Equipment is buy-only in core Oolite.** There is no resale path in the outfitting screen; do not add one in v1 (it would create a money loop and requires depreciation rules). Buying advances the clock by the install time (default `600 + price` seconds).

### G. Station screens and what each contains

| Screen | Oolite key | Contents | v1 treatment |
|--------|------------|----------|--------------|
| Outfitting | `3` / `F3` | Cash; scrollable list of available equipment with name, price, install time; selected-item info pane; fuel row only when not full; purchase confirmation/error. Availability is TL + ship-option + prerequisite gated. | Ship. Hide combat-only items. Keep fuel, cargo bay, docking computer, gal drive, advanced compass, ANA. |
| Status | `5` / `F5` | Commander name title; ship name; present system; hyperspace target; condition; fuel in LY; cash; legal status; rating; equipment list (damaged first). Page 2: cargo manifest with units and capacity, plus contracts in full Oolite. | Ship the first page; omit legal/rating or show "—". Include a manifest page because trading needs it. |
| Charts | `6` / `F6` | Short-range and long-range chart; current-system marker; target marker; system names (or gov/eco/TL codes in info mode); 7 LY connection lines; distance; fuel range; ANA route; filter/sort with ANA. | Ship both zoom levels, target selection, distance and fuel cost. ANA route/filters P2. |
| System data | `7` / `F7` | System name; economy; government; displayed TL; population; inhabitants; gross productivity; average radius; distance; multi-line description. | P2; all data exists in `planetinfo.plist`. |
| Market | `8` / `F8` | Commodity, extras/short comment, price, for sale, in hold, legality; cash and load line; buy/sell 1 or max; filter/sort. | P1. Keep all columns; filter/sort P2. |
| Save/load | `2` / `F2` | Save commander (name entry), load commander, overwrite confirmation, autosave option in game options. | P1 browser equivalent: slot list, save, load, delete, export/import. |

Screen flow detail: when docked, `1`/`F1` launches and the number keys select screens; in flight, `1`–`4` switch views and `5`–`8` open the same screens. Do not bind F1 to both launch and forward view without a clear docked/in-flight state check.

### H. HUD elements

Oolite's default `hud.plist` draws, in order: targeting reticle (with Scanner Targeting Enhancement), waypoint/advanced-compass markers, scanner (288×64, red), scanner zoom indicator, stick sensitivity indicator, compass (blue), station aegis indicator, fuel-scoop status, speed bar, roll bar, pitch bar, energy gauge, forward shield bar, aft shield bar, fuel bar, cabin temperature, weapon temperature, altitude, missile display, status light, clock, primed equipment, advanced-compass target, weapons-offline text, FPS counter. It also has a message GUI, comms log, and two MFDs.

v1 HUD subset:

| Element | Keep? | Why |
|---------|-------|-----|
| Crosshair | Yes | Aiming/flying reference. |
| Scanner (25.6 km, 3D ellipse with vertical tails) | Yes | Iconic; shows station/planet/buoy and orientation. |
| Scanner zoom | Optional | Nice for docking/approach. |
| Compass (planet → station, plus witchpoint) | Yes | The primary "where is the station" instrument. |
| Aegis indicator | Yes | Tells you when you are in station space; cheap. |
| Speed / roll / pitch bars | Yes | Direct feedback on the flight model. |
| Fuel bar | Yes | Jump budget. |
| Clock | Yes | Jump/launch/dock time. |
| Status light / condition | Yes (green only) | Placeholder for future alert states. |
| Message line | Yes | Docking clearance, jump countdown, purchase results. |
| Shields, energy, cabin/weapon temp, missiles, target reticle, weapons-offline, MFDs | No | Combat systems not in v1; inert dials are worse than absent dials. |
| Altitude | Optional | Only matters near planet surface, which v1 does not land on. |

### I. Docking mechanics and the docking computer

**Manual docking** (Coriolis):

1. Approach from the front of the station. The slot faces along the station's forward axis; the nav buoy sits in front of it.
2. Align the slot horizontally in view, then roll to match the station's rotation. Coriolis `station_roll = 0.08 rad/s` (~4.6°/s, one revolution ~78 s).
3. Enter at moderate speed. Oolite's `DockEntity` treats the ship as docked when its bounding box is inside the port opening and `0.90 × max.z + 0.10 × min.z < 0` (90% past the port plane).
4. Misalignment: the ship scrapes (damage proportional to speed), is pushed back toward the port centre, and can be rejected. Crossing opposite edges of the port at once is fatal.
5. The port is a corridor ~250 m deep; the Coriolis hull is ~1000 m across; the dock mesh bounding box is ~103 × 242 × 250, and Oolite widens the effective gate for ships wider than the nominal opening. Derive the actual opening from the dock mesh and verify orientation in-engine rather than hard-coding a "192 × 64" number from memory.

**Docking clearance:** request with `L` after targeting the station. Oolite grants a 2-minute window, warns 20 s before expiry, and allows renewal/cancel. The code default is on `if the key is absent`, but the shipped `planetinfo.plist` universal block sets `stations_require_docking_clearance = no`, so current master is effectively **off**. Treat clearance as an optional P2 ritual; if enabled, grant instantly in v1 (no NPC traffic) and warn rather than fine.

**Docking computer** (`EQ_DOCK_COMP`):

- `c`: engage autopilot to the targeted station (or main station if none targeted). It requests clearance, flies an approach path, matches roll and docks. Press `c` again to abort. This is real-time, not instant.
- `Shift+C`: fast dock. Only works where `allows_fast_docking` is true; main stations always set it true in `Universe setUpSpace`. Adds 20 minutes to the clock.
- Denied if the station is hostile or the player is a fugitive (not applicable in v1).
- No fuel cost.

**The damage-model gap:** v1 excludes shields/energy, but manual docking's tension comes from collision damage. Decide explicitly:
- (a) bounce-only with strong camera shake and a "docking aborted" message (safe, low tension),
- (b) a small v1-only hull-integrity pool used solely for collisions, with destruction → reload last save (preserves tension, adds a tiny subsystem),
- (c) auto-abort on bad alignment (forgiving, least faithful).

Recommendation: (b) if schedule allows, otherwise (a) plus a clear "practice docking" onboarding. Do not build the full shield/energy model just for docking.

### J. Save format and browser persistence

Oolite saves only while docked, as an XML plist (`commanderDataDictionary` → `writeOOXMLToFile`). The v1 browser save can be JSON, but keep the same semantics and field names where sensible:

| Field | Type | Notes |
|-------|------|-------|
| `version` | string | Save schema version + Oolite data version. |
| `player_name` / `save_name` | string | Commander and slot name. |
| `galaxy_number` | int 0–7 | Current galaxy. |
| `system_id` | int 0–255 | Current system. |
| `target_id` | int 0–255 | Selected hyperspace target. |
| `credits` | int decicredits | Store integer; Oolite stores a float due to a GNUstep bug, do not copy that. |
| `fuel` | int 0–70 | Tenths of a LY. |
| `max_cargo` | int | 20 or 35; recompute from equipment on load and validate. |
| `cargo` | `{good: units}[]` | All 17 keys, zero-filled. |
| `equipment` | string[] | Equipment keys; include damage flags only if v1 adds damage. |
| `ship_clock` | number seconds | Jump/launch/dock/install time. |
| `market` | snapshot | Recommended addition: `{good: {price, quantity}}` for the current station, so reload does not reroll prices. Oolite only saves non-main station markets; this is a small, defensible QoL deviation. |
| `docked` | true | v1 only saves docked; validate on load. |
| `settings` | object | Pitch invert, mouse control, sensitivity, audio (future). |

Persistence mechanics:

- Use `localStorage` for the active autosave and a small number of slots; use IndexedDB if you want many slots or export blobs. A save is a few KB.
- Autosave on launch (Oolite behaviour) and manual save while docked. Do not autosave in flight.
- Keep a schema version and migrate or reject old saves with a clear message. A broken save in a browser has no file manager to fall back on.
- Export/import JSON gives players a backup and makes bug reports reproducible.

### K. Data files to ingest, and counterintuitive behaviours checklist

| File | Contents | v1 use |
|------|----------|--------|
| `Resources/Config/planetinfo.plist` | 2048 system blocks (8 × 256): name, coordinates, economy, government, techlevel, population, productivity, radius, description, inhabitants, station, positions/colours | Systems + chart + F7. ~2.7 MB; convert at build time and split per galaxy for lazy loading. |
| `Resources/Config/trade-goods.plist` | 17 commodity definitions | Market generation; all numeric fields. |
| `Resources/Config/equipment.plist` | Equipment tuples (TL, price, name, key, description, conditions) | Outfitting catalog. |
| `Resources/Config/shipdata.plist` | Ship templates incl. Cobra Mk III, Coriolis, dock | Flight stats, station geometry. |
| `Resources/Config/shipyard.plist` | `cobra3-player` optional equipment + price/TL | Outfitting availability. |
| `Resources/Config/descriptions.plist` | Commodity names, economy/government names, UI strings, system-data labels, legality labels | Names and screen text. |
| `Resources/Config/hud.plist` | Default HUD layout | Reference for the v1 HUD subset. |
| `Resources/Config/keyconfig.plist` / `keyconfig2.plist` | Default bindings | Default control map. |
| `Resources/Models/*.dat`, `Textures/*` | Models/textures (CC BY-NC-SA) | Cobra, Coriolis, planet/station visuals. |

**Counterintuitive behaviours to encode deliberately (and test):**

1. Prices/stock depend only on economy; TL/government/population/productivity do not.
2. Buy and sell at the same price; trades change stock, not price.
3. The main market rerolls on every arrival; stock is not persistent across visits.
4. Alien Items always have zero stock.
5. Narcotics has `peak_export == peak_import == 0`, so bias is always 0 and price is 100% random (0–102.4 Cr).
6. Gold/platinum/gem-stones are kg/g with fractional pods; a ton of gold is ~38,800 Cr.
7. Selling is capped by station stock capacity 127; a full market cannot absorb more.
8. Displayed system TL = raw + 1; equipment gating uses raw TL.
9. "Bargain tech days" can reduce an item's minimum TL by up to 3 on roughly 1/8 of days (`dayRnd & 7`), based on day + item index + system id. Optional flavour, but do not be surprised by it in source.
10. Jump distance is quantised to 0.4 LY via integer truncation; `hypot` changes connectivity.
11. Jump time is `distance²` hours, not linear.
12. Fuel cost is 10 units per LY, minimum 1 unit, so a 5.6 LY jump costs 56 of 70.
13. Full-tank refuel is only ~14 Cr, but the price per LY scales with ship mass (0.33–3.0×).
14. Main stations always allow instant docking; other stations default to no.
15. Docking clearance is off in the shipped config despite wiki/readthedocs saying "on since 1.81".
16. Launch adds 10 min, fast dock adds 20 min, equipment install adds `600 + price` seconds.
17. Equipment cannot be sold back; the Cobra's starting pulse laser and missiles are not a progression currency.
18. Lave is raw TL 4 (displayed 5), so the TL 9 docking computer requires leaving the starting system.

### Confidence and gaps

- **HIGH:** commodity table, price/quantity formula, ship/station stats, fuel/hyperspace rules, docking trigger, equipment prices/TLs, save fields, screen contents. These were read directly from Oolite `master` source and config.
- **MEDIUM:** the exact Coriolis portal opening/orientation. The model bounding box is documented above, but the effective gate is widened at runtime; verify visually before hard-coding collision geometry.
- **MEDIUM:** whether current Oolite's shipped docking-clearance default should be treated as "off" for the port. The config says off; the wiki says on since 1.81. Follow the config, expose a toggle.
- **MEDIUM:** product judgement about the exact v1 cut line (e.g. F7 and ANA as P2). These are scope calls, not data claims.
- **LOW/UNKNOWN:** Oolite's planet/station visual scale and witchpoint distance are compressed for playability; the rendering/architecture research should decide the world scale. This does not affect the feature set.
- **Not investigated:** Oolite's shipyard trade-in valuation, missions/contracts, legal-status maths, NPC AI, and OXP scripting — all deliberately out of scope, but relevant if v2 expands.

## Sources

Primary source (authoritative for numbers and formulas; all paths on `master`, read 2026-11-02):

- [Oolite source repository](https://github.com/OoliteProject/oolite)
- [trade-goods.plist](https://github.com/OoliteProject/oolite/blob/master/Resources/Config/trade-goods.plist) — 17 commodity definitions, peaks, averages, random/economic factors, legality.
- [equipment.plist](https://github.com/OoliteProject/oolite/blob/master/Resources/Config/equipment.plist) — tech levels, prices, fuel/cargo bay/dock computer/gal drive/compass/ANA.
- [shipdata.plist](https://github.com/OoliteProject/oolite/blob/master/Resources/Config/shipdata.plist) — Cobra Mk III player template, Coriolis station and dock.
- [shipyard.plist](https://github.com/OoliteProject/oolite/blob/master/Resources/Config/shipyard.plist) — `cobra3-player` optional equipment.
- [planetinfo.plist](https://github.com/OoliteProject/oolite/blob/master/Resources/Config/planetinfo.plist) — 2048 systems, coordinates, economy/government/TL/population/productivity/radius/descriptions, universal docking-clearance setting.
- [hud.plist](https://github.com/OoliteProject/oolite/blob/master/Resources/Config/hud.plist) — default HUD dials and layout.
- [keyconfig.plist](https://github.com/OoliteProject/oolite/blob/master/Resources/Config/keyconfig.plist) — default bindings.
- [OOCommodities.m](https://github.com/OoliteProject/oolite/blob/master/src/Core/OOCommodities.m) — `generatePriceForGood`, `generateQuantityForGood`, `economicBiasForGood`, market generation.
- [OOCommodityMarket.m](https://github.com/OoliteProject/oolite/blob/master/src/Core/OOCommodityMarket.m) — stock/price storage, capacity, save/load amounts.
- [PlayerEntity.m](https://github.com/OoliteProject/oolite/blob/master/src/Core/Entities/PlayerEntity.m) — start state, commander save fields, buy/sell commodity logic, outfitting screen, chart/status/system-data screens, jump distance/fuel, jump clock.
- [PlayerEntityControls.m](https://github.com/OoliteProject/oolite/blob/master/src/Core/Entities/PlayerEntityControls.m) — launch/dock controls, autopilot/fast-dock entry points.
- [PlayerEntityLoadSave.m](https://github.com/OoliteProject/oolite/blob/master/src/Core/Entities/PlayerEntityLoadSave.m) — save/load flow.
- [DockEntity.m](https://github.com/OoliteProject/oolite/blob/master/src/Core/Entities/DockEntity.m) — docking corridor, port dimensions, dock trigger, docking instructions.
- [StationEntity.m](https://github.com/OoliteProject/oolite/blob/master/src/Core/Entities/StationEntity.m) — market monitoring, docking clearance, fast-dock flag.
- [ShipEntity.m](https://github.com/OoliteProject/oolite/blob/master/src/Core/Entities/ShipEntity.m) — thrust/acceleration, stick rates, max jump range, damage.
- [Universe.m](https://github.com/OoliteProject/oolite/blob/master/src/Core/Universe.m) — system setup/market regeneration, main station fast-dock, clearance default, galactic jump.
- [legacy_random.h](https://github.com/OoliteProject/oolite/blob/master/src/Core/legacy_random.h) — 0.4 LY distance formula and jump-time helper.

Secondary sources (cross-checks and player-facing descriptions):

- [Elite Wiki: Trade-goods (abridged)](https://wiki.alioth.net/index.php/Trade-goods_(abridged)) — semantics of peak_export/peak_import, legality, price_average, price_economic, price_random.
- [Elite Wiki: Commodities.plist](https://wiki.alioth.net/index.php/Commodities.plist) — explicitly notes the old 8-bit formula is obsolete since 1.81; do not port it.
- [Elite Wiki: Hyperspace Drive](https://wiki.alioth.net/index.php/Hyperspace_Drive) — 7 LY limit, galaxy geography, one-way ring.
- [Elite Wiki: Docking](https://wiki.alioth.net/index.php/Docking) and [How to Dock](https://wiki.alioth.net/index.php/How_to_Dock) — manual docking procedure, rotation matching.
- [Elite Wiki: Docking Computers](https://wiki.alioth.net/index.php/Docking_Computers) — `c` autopilot behaviour, targeting non-main stations.
- [Elite Wiki: Docking Clearance Protocol](https://wiki.alioth.net/index.php/Oolite_Docking_Clearance_Protocol_%28v1.72_or_later%29) — request/window/renew behaviour (note the config discrepancy above).
- [Elite Wiki: HUD](https://wiki.alioth.net/index.php/HUD) — scanner/compass/speed/roll/pitch descriptions.
- [Elite Wiki: Oolite Keyboard Controls](https://wiki.alioth.net/index.php/Oolite_Keyboard_Controls) — default bindings, pitch-forward semantics, autopilot/fast-dock keys.
- [Elite Wiki: Roll vs Yaw crusades](https://wiki.alioth.net/index.php/Roll_vs_Yaw_crusades) — yaw history and why pitch/roll is the Elite feel.
- [Elite Wiki: Oolite JavaScript Reference: Station](https://wiki.alioth.net/index.php/Oolite_JavaScript_Reference:_Station) — `allowsFastDocking` default and main-station exception.
- [Oolite readthedocs: In Dock Commands](https://oolite.readthedocs.io/en/latest/) — F-key screen map and market buy/sell controls.
- [Oolite starting guide](https://oolite.space/html/starting) — Lave start, compass-to-station, docking practice, torus drive.

---

*Feature research for: Wegolite (browser Oolite core-loop port)*
*Researched: 2026-11-02*
