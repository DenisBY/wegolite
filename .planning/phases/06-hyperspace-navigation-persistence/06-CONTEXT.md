# Phase 6: Hyperspace, Navigation & Persistence - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase closes the single-player loop. It delivers:

- a galactic chart (F6) showing all 256 systems of the current galaxy, the 7 LY graph, current/target markers and a fuel-range circle;
- target selection with distance and fuel-cost readout, including clear refusal of unreachable jumps;
- a pure hyperspace-math module (distance, fuel cost, jump time) matching Oolite's integer formula;
- a 15-second abortable countdown and a hyperspace arrival at the destination witchpoint with a freshly generated market and scene;
- save schema v2 with ordered v1 -> v2 migration, exact docked and in-flight restore, current-market persistence, and safe corrupt/future handling;
- an F2 Save/Load screen available while docked, using the single autosave slot.

Out of scope: combat, NPC traffic, missions, legal status, sound, multiple galaxies/galactic hyperdrive, Advanced Navigational Array route plotting, named save slots, and any server-side storage. The project remains desktop-web, static, GPL-2.0-or-later code with CC BY-NC-SA 3.0 Oolite-derived assets.

Requirements covered: NAV-01..NAV-06, SAVE-01..SAVE-06, WORLD-06.

</domain>

<decisions>
## Implementation Decisions

### Galactic chart

- **D-01:** F6 opens the galactic chart both in flight and while docked. In flight the simulation is suspended while the chart is open; the chart is not the pause menu and must not show the pause overlay. Closing the chart returns to the previous flight or docked state. F6 is ignored during the launch cinematic. — **Reversibility:** costly — the suspend path touches the game loop, input contexts and both UI shells.
- **D-02:** Chart input is mouse plus keyboard. Clicking a system selects it; the arrow keys select the nearest system in that direction; Tab toggles short/long range; Enter commits the selected system as the hyperspace target; Esc or F6 closes the chart. The chart does not pan freely: short range is a fixed window centred on the current system, long range fits the whole galaxy. Ship status is frozen while the chart is open.
- **D-03:** Any system other than the current one may be selected and committed as a target, including unreachable ones. The chart always shows distance in LY and fuel cost, marks systems beyond 7.0 LY or beyond current fuel, and draws a separate line from the current system to the target. Starting the jump is refused with a clear message (`too far`, `insufficient fuel`, or `no target`); selecting the current system is allowed but cannot start a jump. This matches Oolite's checklist-at-jump behaviour.
- **D-04:** The chart draws all 256 systems of the current galaxy and an edge between every pair whose Oolite distance is at most 7.0 LY, in both projections. Short range shows a window around the current system that contains at least its 7 LY neighbourhood; long range shows the entire galaxy. A fuel circle centred on the current system has radius `fuel / 10` LY. Current system and target are visually distinct; unreachable systems are dimmed or otherwise marked without hiding their names. No route search, filters or economy overlays are added.

### Hyperspace math and jump sequence

- **D-05:** WORLD-06 is a pure module under `src/sim/hyperspace/` with no Three.js, DOM or content imports. It exports the Oolite-exact distance, fuel cost and jump time:
  - `dx = x1 - x2`
  - `dy = trunc((y1 - y2) / 2)` using truncation toward zero
  - `dist = trunc(sqrt(dx * dx + dy * dy))`
  - `distanceLy = 0.4 * dist`
  - `fuelCost = 10 * max(0.1, distanceLy)`
  - `jumpTimeSeconds = distanceLy * distanceLy * 3600`
  - maximum jump range is 7.0 LY.

  Required fixtures: Lave -> Diso (20,173 -> 11,174) = 3.6 LY, 36 fuel units, 12.96 h; Lave -> Zaonce (20,173 -> 33,185) = 5.6 LY, 56 units, 31.36 h. Lave -> Leesti and Lave -> Riedquat from FEATURES §E are additional fixtures. Using `hypot` or floating division instead of the integer truncation is a defect.
- **D-06:** The countdown lives in the pure simulation as fixed-step state, not in an app timer. It lasts exactly 15 seconds (1800 steps at 1/120 s). Starting it requires a committed target, a different current system, distance at most 7.0 LY and `fuel >= cost`. Pressing the hyperspace key again (default H) aborts the countdown; aborting costs nothing. Pitch, roll, speed and torus remain live during the countdown; ordinary flight input does not abort it. Only the hyperspace key cancels.
- **D-07:** Fuel is spent and the clock advanced atomically when the countdown completes. The sim revalidates target, range and fuel, emits one jump-completed event, and the app applies the exact `10 * max(0.1, distance)` deduction to the profile. The sim advances `clockSeconds` by `distance^2 * 3600`. A cancelled or refused jump changes neither fuel nor clock. Fuel must reach the sim through read-only step options (like the equipment set), never by moving the profile into `FlightState`.
- **D-08:** Arrival is Oolite-like but deterministic. The ship appears at the destination witchpoint plus a deterministic offset within scanner range derived from a stable hash of origin system id and destination system id (no `Math.random`, no clock); the offset is clamped to the witchpoint safety distance. Orientation is almost facing the planet with a tiny deterministic tilt derived from the same hash; speed is 50, pitch/roll rates are 0, torus is off, and mode is `inFlight`. The same route always produces the same arrival pose, and the saved pose is authoritative after a reload.
- **D-09:** On jump completion the app resolves the destination system from the current galaxy, derives its layout, generates a fresh market with a new seed, builds the new `SystemScene` before swapping, installs it, and only then re-enables the loop. There is no asynchronous "jumping" mode and no page reload.
- **D-10:** The market is regenerated on every hyperspace arrival, including repeat visits, matching Oolite. The arrival seed is derived deterministically by chaining the destination system id with the previous market seed (for example `fnv1a32(targetId + ":" + previousSeed + ":arrival")`), never from the clock or global randomness. A new game keeps Phase 5's `marketSeedForSystem` seed. The snapshot of the destination market is what is persisted; reload never regenerates it.
- **D-11:** The countdown message line shows the destination and remaining whole seconds. Cancel, refusal and arrival messages are app-owned copy; the sim emits payload-free events. No audio is added.
- **D-12:** The committed target system id is part of game state and is persisted in v2 so F5's "Hyperspace System" line and the HUD show the same target after reload. An active countdown is not persisted: autosaves only happen while docked, immediately before launch, or after arrival, never during a countdown, and F2 is docked-only.

### Save schema v2 and migration

- **D-13:** Bump `SAVE_VERSION` to 2. The v2 object is one strict JSON object with a numeric `version`, preserving every v1 field and adding:
  - `mode: "docked" | "inFlight"`;
  - optional `targetSystem` (an allow-listed system id);
  - a current-market snapshot (`systemId`, `seed`, and goods entries of `key`, `price`, `stock`);
  - for `mode: "inFlight"`, a flight pose containing `position` (3 numbers), `orientation` (4 numbers), `speed`, `pitchRate`, `rollRate` and `torus` engaged flag;
  - the existing `clockSeconds`, credits, equipment, cargo, fuel, missiles, passengerBerths, system and station identity.

  A docked v2 save omits the flight pose; its pose is derived from the station layout as in Phase 4. A v2 save always carries the market snapshot unless it is the direct product of a v1 migration. The exact key names are the planner's choice, but the semantic content above is fixed. — **Reversibility:** one-way — changing the shape after release requires another ordered migration and breaks the published v2 contract.
- **D-14:** Migrations are ordered pure functions. `v1 -> v2` maps `mode` `"docked"`, keeps all v1 fields, drops no data, derives the market seed from the v1 `marketSeed` (or `marketSeedForSystem(system.id)` when absent), and leaves the market snapshot absent so the session can generate it from the seed before the first write. Legacy aliases keep their Phase 4 read-mode folding. Future versions (>2) remain untouched and unreadable-by-this-build. Corrupt blobs are still copied to `autosave.corrupt` before any clear and never read back.
- **D-15:** The save size bound is raised only as far as needed for v2 (proposal: 65,536 characters). Existing bounds for equipment (64 keys), cargo (17 entries), fuel (0..70), missiles (0..3), berths (0..7), system id and station key remain. The market snapshot accepts exactly the 17 known commodity keys, no duplicates, stock 0..127 and safe non-negative integer prices. The target, when present, must be in the system allow-list. Unknown keys, non-finite poses or a zero-length orientation make the save corrupt.
- **D-16:** One semantic validator remains the single source of truth for the boot reader, autosave writer, migration output and F2 load. `validateSaveSemantics` gains v2 rules: market system id equals the saved system id, goods keys are allow-listed, pose numbers are finite, orientation has non-zero length and is normalized before use, speed and rates are bounded, `targetSystem` is allow-listed, and an in-flight save has a pose while a docked save does not. Invalid snapshots leave the previous bytes untouched.
- **D-17:** The one save slot is a segment anchor, not a continuous position log. Autosave triggers are:
  - a docked save on the `docked` event (manual and computer docking), once the station state is ready;
  - a docked save immediately **before** the launch transition, taken while the state is still `docked` and before `beginLaunch` applies the +600 s clock and switches to `launching`. The snapshot must be taken from the real docked state, not reconstructed from the `launched` event;
  - an in-flight save after hyperspace arrival, once the new scene and market are installed;
  - the existing accepted-trade and accepted-fit saves;
  - the manual F2 Save.

  All triggers write the same `autosave` key. Reload therefore returns to the start of the current leg: the station before launch, or the witchpoint after a jump. It does not restore a mid-leg pose; that is intentional. In-flight restore is exercised by the arrival save. Because the pre-launch snapshot is docked, no `launching` state is persisted. The pre-launch write is queued before the launch step; awaiting the commit is allowed but not required (best-effort durability). Future/unreadable protection is unchanged.
- **D-18:** Restore handles both modes. Docked restore creates a fresh docked flight state, applies the saved clock and derives the station pose. In-flight restore rebuilds the saved system scene, sanitizes and applies the saved pose, mode, speed, rates, torus and clock, and leaves the station UI hidden. Profile and market are restored beside the flight state. A saved market snapshot is used verbatim; a missing snapshot (v1 migration only) is generated from its seed. Corrupt, future or unreadable saves never destroy the current session.
- **D-19:** Save/load remains a single versioned JSON object in IndexedDB, key `autosave`, with the existing `SaveStore` port and revision semantics. No database, ORM or server storage is introduced. `appVersion` stays diagnostics-only.

### F2 Save/Load screen

- **D-20:** F2 opens a standalone full-screen Save/Load screen only while docked; in flight F2 is ignored. It is not a station-computer section and not the pause menu. It offers Save, Load and Return, uses the same header/footer visual language as the station shell, and is fully keyboard-operable through semantic actions. — **Reversibility:** costly — it adds a new input context and overlay but does not change the save contract.
- **D-21:** There is exactly one save slot: the existing `autosave` key. Manual Save writes the same key and asks for confirmation before overwriting a committed save; Load reads and validates that key; Return closes the screen. No `manual` key, no named slots and no export/import UI.
- **D-22:** Load is in-session and does not reload the page. It validates the save with the shared allow-lists, then stops the loop, builds the saved system scene before swapping, restores profile, market and flight state, resets station/chart/F2 UI, and resumes. A failed load shows an error and leaves the current session untouched. If the saved state is in flight, the game returns to flight; if docked, to the station UI.
- **D-23:** After a successful manual save, the footer/notice and the save probe reflect the committed revision and clock. The title's Continue path after a real page reload uses exactly the same parse, migration and restore code.

### Input and HUD integration

- **D-24:** Add semantic actions for the chart, hyperspace, save/load and their screen navigation. Defaults are F6 for the chart, H for hyperspace, F2 for Save/Load; F2 and F6 join the reserved F-key set so the browser does not act on them. New input contexts are required for the chart and the F2 screen; station and flight contexts must not leak actions into them.
- **D-25:** The HUD/message line owns countdown, cancellation and refusal copy. The sim emits `hyperspaceCountdownStarted`, `hyperspaceCountdownCancelled`, `hyperspaceJumped` and refusal events with data only; no UI strings live in `src/sim`.

### the agent's Discretion

- Exact chart colours, fonts, marker shapes, label placement, short-range zoom factor and fuel-circle stroke style.
- Exact deterministic hash-to-offset mapping and the magnitude of the arrival jitter, provided the result is stable, clamped to safety, and never uses `Math.random`.
- Exact v2 field names and whether the market is a nested object or a flat array, provided the semantic content and strict validation in D-13/D-16 hold.
- The precise save-size bound (65,536 is a proposal), the F2 screen markup and the migration function names.
- Whether the chart freeze is implemented as a new `suspended` reason, a dedicated chart mode, or a pause variant, as long as the pause overlay is not shown and the simulation does not advance.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap

- `.planning/REQUIREMENTS.md` — NAV-01..NAV-06, SAVE-01..SAVE-06, WORLD-06.
- `.planning/ROADMAP.md` — Phase 6 goal, mode `mvp`, success criteria and dependencies.
- `.planning/PROJECT.md` — Key Decisions on save schema, market seed stability, Docker-only workflow, licensing and out-of-scope features.

### Research

- `.planning/research/FEATURES.md` §E — Oolite distance formula, fuel cost, 7 LY cap, jump time, countdown, arrival, chart connectivity and the Lave fixture table.
- `.planning/research/FEATURES.md` §F — fuel capacity, credits in decicredits, cargo units and the v1 equipment set.
- `.planning/research/FEATURES.md` §G — station screens and the F2/F6 key layout.

### Oolite behaviour and data

- `/home/opencode/git/oolite/src/Core/legacy_random.h` — `distanceBetweenPlanetPositions`, `accurateDistanceBetweenPlanetPositions`, `travelTimeBetweenPlanetPositions`.
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m` — `hyperspaceJumpDistance`, `fuelRequiredForJump`, `witchJumpChecklist`, `witchJumpTo`, `enterWitchspace`, `leaveWitchspace`, `witchEnd`, `commanderDataDictionary` (save fields, `market_rnd`, `localMarket`).
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntityControls.m` — countdown start/abort, chart screen switching, F2 options screen.
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntityLoadSave.m` — save/load flow, `localMarket`, docked restore, autosave.
- `/home/opencode/git/oolite/src/Core/Universe.m` — `setSystemTo`, `getWitchspaceExitPosition`, `getWitchspaceExitRotation`, `safeWitchspaceExitDistance`, chart connection drawing.
- `/home/opencode/git/oolite/src/Core/OOCommodityMarket.m` — `saveStationAmounts` / `loadStationAmounts` (good, quantity, price).
- `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.h` — `MAX_JUMP_RANGE` (7.0) and `DEFAULT_HYPERSPACE_SPIN_TIME` (15.0).
- `/home/opencode/git/oolite/Resources/Config/keyconfig.plist` — `key_gui_chart_screens` and the F2/F6 key conventions.

### Content and existing code

- `src/content/generated/systems/g0.json` — compiled `chartX`/`chartY`, economy, tech level and system identity.
- `src/content/systems.ts` — `galaxy0()`, `loadGalaxy()`, `loadAnyGalaxy()` and the lazy galaxy chunks.
- `src/content/schemas/system.ts` — the compiled system schema and chart fields.
- `src/sim/economy/market.ts` — `Market`, `MarketGood`, `generateMarket`, `marketSeedForSystem`, `MARKET_LIMIT`.
- `src/sim/flight/state.ts` — `FlightState`, `FlightMode`, `serializeFlight`, `initFlightState`, `dockMouthPosition`.
- `src/sim/world/layout.ts` — `deriveSystemLayout`, witchpoint/planet/station geometry, scanner and aegis ranges.
- `src/sim/flight/step.ts` — command drain, mode transitions, fixed-step clock and event collection.
- `src/sim/commands.ts` / `src/sim/events.ts` — the command and event boundary the new hyperspace actions must extend.
- `src/persistence/save.ts` — v1 schema, parse order, allow-lists, `validateSaveSemantics`, bounds and corrupt backup.
- `src/persistence/autosave.ts` — `snapshotForSave`, `queueAutosave`, `profileFromSave`, `restoreFromSave`.
- `src/persistence/store.ts` / `src/persistence/idb-store.ts` — `SaveStore`, `SaveStatus`, revision semantics and IndexedDB keys.
- `src/app/game-session.ts` — composition root, system/profile/market ownership, station screens, autosave and the frame loop.
- `src/app/scene-manager.ts` — `SceneManager.enterSystem`, build-before-swap and system scene disposal.
- `src/app/mode.ts` — `advanceMode` and `screenForMode`.
- `src/input/actions.ts` — `ActionId`, `ACTION_CONTEXTS`, `DEFAULT_BINDINGS`, `RESERVED_F_KEYS`, shift variants.
- `src/input/keyboard.ts` — context switching, reserved-key capture and `setContext`.
- `src/ui/station.ts` / `src/ui/station-model.ts` — full-screen station shell and pure view-model pattern.
- `src/ui/title.ts` — Continue/New game and the save-confirmation dialog.
- `src/app/probe.ts` — the live probe and the `?test=1` hook; the new chart/hyperspace/save fields must be added here.
- `index.html` — the station, title and pause markup the new overlays must sit beside without duplicating `<footer>`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `deriveSystemLayout(system, stationDef)` gives a pure layout for any system, including the witchpoint at the origin and the planet direction; re-use it rather than inventing a second coordinate model.
- `SceneManager.enterSystem(system, stationDef)` already builds a new scene, applies the viewport, installs it, then retires the old one. Hyperspace and in-session Load should use this exact path.
- `generateMarket(system, commodities, seed)` and `Market`/`MarketGood` already produce the snapshot shape needed by v2; `marketSeedForSystem` is the new-game seed derivation.
- `parseSave`, `validateSaveSemantics`, `isEncodedSaveValid`, `queueAutosave`, `snapshotForSave`, `profileFromSave` and `restoreFromSave` are the save pipeline to extend; do not create a parallel parser or validator.
- `SaveStore` with `read`/`write`/`clear`/`backupCorrupt` and revisions is the only IndexedDB surface needed for the single-slot design.
- The station shell's header/section/footer structure and `textContent`-only rendering are the pattern for the chart and F2 overlays. New overlays must not add a second `<footer>` element.
- `ACTION_CONTEXTS` and `setContext` are the mechanism for keeping chart, save/load, station and flight actions separate.

### Established Patterns

- `src/sim/` is pure TypeScript with no Three.js or DOM, deterministic at 1/120 s. Hyperspace math and the countdown belong there; scene construction, market generation from content and all copy belong in the app.
- Commands are plain tagged values drained once per step; events carry data, not UI strings. New hyperspace commands/events must follow this boundary.
- The app is a single composition root (`GameSession`) that owns the flight state, profile, market and save status but not the system collection. Hyperspace and Load need a supported system-swap path there.
- Saves are strict zod objects validated semantically on read and write; an invalid snapshot must never replace a good blob. Future and unreadable blobs are untouchable.
- Browser proofs are probe assertions, never screenshots. New chart, countdown, arrival and save/load fields must be exposed on `window.__wegolite`.

### Integration Points

- `GameSession`: add the destination system swap, market re-seed, in-session load, chart suspension and F2 screen state; keep the same layout/config/scene ownership.
- `main.ts`: extend boot parsing to v2 and migration, keep allow-lists derived from validated content, and pass the same parsed save into Continue.
- `src/input/actions.ts` + `keyboard.ts`: add chart/hyperspace/save-load actions, contexts and F2/F6 reserved keys.
- `src/ui/` + `index.html`: add the chart overlay and F2 overlay beside `#docked`, with the same visual language and no second footer.
- `src/app/probe.ts`: add chart target/range, countdown remaining, jump counters, market snapshot identity, save mode and load result so Playwright can prove the phase without screenshots.
- `src/persistence/save.ts` + `autosave.ts`: add v2 schema, ordered migration, current-market snapshot and in-flight restore; update the semantic validator in the same change.

</code_context>

<specifics>
## Specific Ideas

- Oolite's distance is deliberately quantised and rounded through integer math. The user explicitly wants the integer formula reproduced, not a visually "more accurate" Euclidean distance.
- The chart is a graph, not a distance field: edges are drawn from the 0.4 LY formula, never from pixel distance.
- The user asked for Oolite-first answers before every decision. Where Oolite differs, the chosen deviation and its reason are recorded here (deterministic arrival, arrival autosave, in-flight restore, F2 single-slot screen).
- Oolite facts verified during discussion:
  - arrival position is the witchpoint plus a random scanner-range offset, not the exact buoy;
  - arrival orientation is near identity with a small random tilt;
  - arrival speed is `min(maxFlightSpeed, 50.0)`;
  - Oolite saves only while docked and restores to the station;
  - Oolite stores `market_rnd` and the current station's `localMarket` (good, quantity, price), but not the jump target;
  - Oolite has no arrival autosave.
- Fixtures to pin in unit tests:
  - Lave -> Diso: 3.6 LY, 36 fuel, 12.96 h;
  - Lave -> Leesti: 3.6 LY, 36 fuel, 12.96 h;
  - Lave -> Zaonce: 5.6 LY, 56 fuel, 31.36 h;
  - Lave -> Riedquat: 6.8 LY, 68 fuel, 46.24 h;
  - Lave -> Tibedied: 17.6 LY, unreachable.
- The owner approved interpreting SAVE-02's "per-system market snapshots" as the snapshot of the current system, replaced on every arrival. A map of every visited system was considered and explicitly rejected.
- The autosave model is a single-slot segment anchor: station -> witchpoint -> station. Death after a jump returns to the post-jump state, losing the in-system flight to the station; death before the first jump returns to the pre-launch station. This is the owner's chosen death semantics, not a mid-flight resume feature.
- Pirates and combat are out of scope for Phase 6. Any future encounter design is expected to be probabilistic and system-weighted, but the RNG/reload policy (persist and continue versus reseed and reroll) is deferred to the combat phase.

</specifics>

<deferred>
## Deferred Ideas

- Advanced Navigational Array automatic route plotting, fewest-jumps/least-time search and chart filters — future progression feature.
- Galactic Hyperdrive, the 8-galaxy ring and inter-galactic travel — out of scope for v1.
- Oolite-style random witchpoint exit offset and orientation jitter — deferred in favour of a deterministic derivation so the simulation stays replayable. **Superseded 2026-11-07 (owner direction; plan 06-15):** the Oolite-style random witchpoint exit offset and orientation jitter are now drawn at jump commit from the sim's seeded PRNG and persisted through the saved pose, so a reload never re-rolls the arrival and the simulation stays replayable from the seed; see PROJECT.md Key Decisions.
- Persisting an active countdown or supporting save-anywhere — not needed while F2 is docked-only and autosaves happen on launch/arrival.
- Multiple named save slots, save export/import and commander files — explicitly out of scope; one IndexedDB slot only.
- Combat, NPC traffic, missions, legal status and sound remain outside this phase.
- Pirates and encounter RNG policy — future combat phase. Probabilistic, system-weighted encounters are preferred over a fixed per-system script; allowing reload to reroll them requires deliberately not persisting or reseeding the encounter RNG, which conflicts with SAVE-02's persisted RNG state and needs a separate decision.

</deferred>

---

*Phase: 6-Hyperspace, Navigation & Persistence*
*Context gathered: 2026-11-06*
