# Phase 6: Hyperspace, Navigation & Persistence - Research

**Researched:** 2026-11-06
**Domain:** Oolite-exact hyperspace math, 7 LY chart graph rendering, save schema v2 + ordered migration, in-flight restore, single-composition-root system swap
**Confidence:** HIGH for the Oolite hyperspace/arrival/save facts (read from the pinned checkout at `/home/opencode/git/oolite` this session) and HIGH for every existing repo seam named below (read this session); MEDIUM for the chart rendering medium, the deterministic arrival hash and the v2 key layout, which are new design inside D-01..D-25's discretion.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Galactic chart

- **D-01:** F6 opens the galactic chart both in flight and while docked. In flight the simulation is suspended while the chart is open; the chart is not the pause menu and must not show the pause overlay. Closing the chart returns to the previous flight or docked state. F6 is ignored during the launch cinematic. — **Reversibility:** costly — the suspend path touches the game loop, input contexts and both UI shells.
- **D-02:** Chart input is mouse plus keyboard. Clicking a system selects it; the arrow keys select the nearest system in that direction; Tab toggles short/long range; Enter commits the selected system as the hyperspace target; Esc or F6 closes the chart. The chart does not pan freely: short range is a fixed window centred on the current system, long range fits the whole galaxy. Ship status is frozen while the chart is open.
- **D-03:** Any system other than the current one may be selected and committed as a target, including unreachable ones. The chart always shows distance in LY and fuel cost, marks systems beyond 7.0 LY or beyond current fuel, and draws a separate line from the current system to the target. Starting the jump is refused with a clear message (`too far`, `insufficient fuel`, or `no target`); selecting the current system is allowed but cannot start a jump. This matches Oolite's checklist-at-jump behaviour.
- **D-04:** The chart draws all 256 systems of the current galaxy and an edge between every pair whose Oolite distance is at most 7.0 LY, in both projections. Short range shows a window around the current system that contains at least its 7 LY neighbourhood; long range shows the entire galaxy. A fuel circle centred on the current system has radius `fuel / 10` LY. Current system and target are visually distinct; unreachable systems are dimmed or otherwise marked without hiding their names. No route search, filters or economy overlays are added.

#### Hyperspace math and jump sequence

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

#### Save schema v2 and migration

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

#### F2 Save/Load screen

- **D-20:** F2 opens a standalone full-screen Save/Load screen only while docked; in flight F2 is ignored. It is not a station-computer section and not the pause menu. It offers Save, Load and Return, uses the same header/footer visual language as the station shell, and is fully keyboard-operable through semantic actions. — **Reversibility:** costly — it adds a new input context and overlay but does not change the save contract.
- **D-21:** There is exactly one save slot: the existing `autosave` key. Manual Save writes the same key and asks for confirmation before overwriting a committed save; Load reads and validates that key; Return closes the screen. No `manual` key, no named slots and no export/import UI.
- **D-22:** Load is in-session and does not reload the page. It validates the save with the shared allow-lists, then stops the loop, builds the saved system scene before swapping, restores profile, market and flight state, resets station/chart/F2 UI, and resumes. A failed load shows an error and leaves the current session untouched. If the saved state is in flight, the game returns to flight; if docked, to the station UI.
- **D-23:** After a successful manual save, the footer/notice and the save probe reflect the committed revision and clock. The title's Continue path after a real page reload uses exactly the same parse, migration and restore code.
- **D-24:** Add semantic actions for the chart, hyperspace, save/load and their screen navigation. Defaults are F6 for the chart, H for hyperspace, F2 for Save/Load; F2 and F6 join the reserved F-key set so the browser does not act on them. New input contexts are required for the chart and the F2 screen; station and flight contexts must not leak actions into them.
- **D-25:** The HUD/message line owns countdown, cancellation and refusal copy. The sim emits `hyperspaceCountdownStarted`, `hyperspaceCountdownCancelled`, `hyperspaceJumped` and refusal events with data only; no UI strings live in `src/sim`.

### the agent's Discretion

- Exact chart colours, fonts, marker shapes, label placement, short-range zoom factor and fuel-circle stroke style.
- Exact deterministic hash-to-offset mapping and the magnitude of the arrival jitter, provided the result is stable, clamped to safety, and never uses `Math.random`.
- Exact v2 field names and whether the market is a nested object or a flat array, provided the semantic content and strict validation in D-13/D-16 hold.
- The precise save-size bound (65,536 is a proposal), the F2 screen markup and the migration function names.
- Whether the chart freeze is implemented as a new `suspended` reason, a dedicated chart mode, or a pause variant, as long as the pause overlay is not shown and the simulation does not advance.

### Deferred Ideas (OUT OF SCOPE)

- Advanced Navigational Array automatic route plotting, fewest-jumps/least-time search and chart filters — future progression feature.
- Galactic Hyperdrive, the 8-galaxy ring and inter-galactic travel — out of scope for v1.
- Oolite-style random witchpoint exit offset and orientation jitter — deferred in favour of a deterministic derivation so the simulation stays replayable.
- Persisting an active countdown or supporting save-anywhere — not needed while F2 is docked-only and autosaves happen on launch/arrival.
- Multiple named save slots, save export/import and commander files — explicitly out of scope; one IndexedDB slot only.
- Combat, NPC traffic, missions, legal status and sound remain outside this phase.
- Pirates and encounter RNG policy — future combat phase. Probabilistic, system-weighted encounters are preferred over a fixed per-system script; allowing reload to reroll them requires deliberately not persisting or reseeding the encounter RNG, which conflicts with SAVE-02's persisted RNG state and needs a separate decision.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | F6 plots all 256 systems with short/long range and 7 LY connection lines | Galaxy-0 extents measured (x 2..253, y 0..254; 875 edges at `dist ≤ 17`); 2:1 chart projection derived from Oolite's `vscale` half-factor; canvas plot with paint-on-change |
| NAV-02 | Select a target, see distance and fuel cost, unreachable blocked | Pure `chart-model` selection + `jump.ts` integer distance/cost; refusal enum `no target`/`too far`/`insufficient fuel` mirrors `witchJumpChecklist` |
| NAV-03 | Fuel ≥ cost, 70-unit tank, 7.0 LY max | `PLAYER_MAX_FUEL 70` (`PlayerEntity.h:282`), `MAX_JUMP_RANGE 7.0` (`ShipEntity.h:109`), range test as `dist ≤ 17` integer units |
| NAV-04 | 15 s abortable countdown; clock += distance² hours | `DEFAULT_HYPERSPACE_SPIN_TIME 15.0f` (`ShipEntity.h:72`); `1800` fixed steps; `clockDelta = 576 × dist²` exact |
| NAV-05 | Arrival at destination witchpoint with fresh market and new scene | `leaveWitchspace` (`PlayerEntity.m:6913-6969`) arrival pose; `enterSystem` build-before-swap; `fnv1a32` seed chaining |
| NAV-06 | Fuel deducted exactly `10 × max(0.1, distance)`, never negative | `fuelRequiredForJump` (`PlayerEntity.m:6630-6633`); integer identity `4 × dist`; `fuel ≥ cost` gate |
| SAVE-01 | One versioned JSON object, strict schema, ordered migrations, future untouched, corrupt backed up | Existing chain in `src/persistence/save.ts`; add `migrateV1ToV2`; `version: 2` now current so future tests move to 3 |
| SAVE-02 | IndexedDB persists credits, cargo, fuel, equipment, location, clock, RNG state, market snapshots | Existing `SaveStore`; v2 adds market snapshot + `targetSystem`; no schema/RNG object is needed beyond the persisted seeds |
| SAVE-03 | Restore exact docked or in-flight state incl. orientation and velocity | `profileFromSave`/`restoreFromSave` extension; `sanitizeFlightState` bounds; pose applied before the first step |
| SAVE-04 | Ordered migrations; corrupt fails safely without wiping good data | `parseSave` classification order (size → parse → future → shape → schema → semantics → allow-lists) preserved; `isEncodedSaveValid` gates the writer |
| SAVE-05 | F2 save/load while docked; autosave on launch and arrival | New docked-only overlay + context; pre-launch snapshot in `frame()`; arrival autosave in the `hyperspaceJumped` handler |
| SAVE-06 | Reloaded market keeps prior stock and prices | Market snapshot persisted verbatim; reload never regenerates; `alien_items` allow-list split required |
| WORLD-06 | Pure hyperspace math module matching the two fixtures | `src/sim/hyperspace/jump.ts`; five CONTEXT fixtures plus `Legees→Laeden` (dist 0) and edge-count 875 as trunc-vs-floor discriminators |
</phase_requirements>

## Summary

Phase 6 is mostly **integration of seams that already exist**, plus two genuinely new pure modules and one wire-format migration. The three hard facts that drive the whole plan:

1. **The hyperspace arithmetic must never touch a float on the way to stored state.** Oolite's distance is `trunc(sqrt(dx² + trunc((y1-y2)/2)²))` in *integer chart units*, and every derived value has an exact integer identity: `fuelCost = 4 × dist` (one fuel unit = 0.1 LY) and `jumpTimeSeconds = 576 × dist²`. Computing those through `0.4 × dist` and then subtracting from the fuel tank produces `13.999999999999993` at Lave→Zaonce — a non-integer fuel value that the v1/v2 save schema (`z.number().int()`) rejects, which would make the **arrival autosave fail with `invalid-save`** and silently lose the post-jump state. That single float slip is the highest-severity risk in the phase.
2. **Every existing autosave/restore/validate seam is a single pipeline that must be extended, not paralleled.** `parseSave` → `SaveV1Schema` → `validateSaveSemantics` → `encodeSave` → `isEncodedSaveValid` → `snapshotForSave` → `restoreFromSave` are one chain (five modules, one validator). v2 means: bump `SAVE_VERSION`, add one schema, add one ordered `migrateV1ToV2`, add the market/pose rules to the *same* `validateSaveSemantics`, and extend `encodeSave`. No second parser, no second validator, no second store.
3. **The system swap path already exists and is safe to reuse verbatim.** `SceneManager.enterSystem` builds the new scene, applies the viewport, installs it, then retires the old one (`scene-manager.ts:126-139`); `GameSession` holds `state/layout/config/scene/profile/market` as locals, so "hyperspace" is: derive the destination layout, `enterSystem`, re-seed the market, apply the arrival pose, autosave. The one real structural change is that `system` must become mutable (today it is a captured option, always Lave).

Two discoveries materially change the plan from what CONTEXT.md assumes:

- **The market snapshot cannot be validated against `SaveAllowLists.commodities`.** That allow-list is deliberately the *16 tradeable* goods (`main.ts:147-151` excludes `alien_items`), while `generateMarket` emits **17** goods including Alien Items (`market.ts:125-166`; `tests/sim/economy/market.test.ts:144` pins 17). A 17th key in the snapshot would be rejected as corrupt on the very next reload. v2 needs a separate 17-key market allow-list.
- **`version: 2` is already used by two browser tests as the *future* version** (`tests/e2e/autosave.spec.ts:479`, `:684`). The future-version proofs must move to `version: 3`, and `MAX_SAVE_CHARS` is used as the padding size in one of them.

**Primary recommendation:** Build three pure pieces first — `src/sim/hyperspace/jump.ts` (integer distance/fuel/time), `src/sim/hyperspace/countdown.ts` + `arrival.ts` (fixed-step timer and deterministic witchpoint pose), `src/ui/chart-model.ts` (systems, edges, projection, selection) — each fully unit-tested against the five pinned fixtures plus the two new discriminating ones (`Legees → Laeden` = dist 0, and galaxy-0 edge count = 875). Then wire save v2 as one schema + one migration + one validator extension, and only then the two overlays and the `GameSession` system swap.

## Project Constraints (from AGENTS.md)

Actionable directives extracted from `AGENTS.md`; the planner must verify each plan against them.

- **Containers only.** The app and every test run in Docker. `docker compose run --rm verify` is the definition of done; a green host run is not evidence. Never `npm install` on the host.
- **After a `package.json`/`package-lock.json` change** run `docker compose down --volumes` as well as `build` (the named `node_modules` volume keeps its old contents).
- **No database, ORM or server-side storage.** IndexedDB only; static client.
- **`src/sim/` is pure TypeScript:** no Three.js, no DOM, no content runtime imports, deterministic at 1/120 s. Rendering/input/UI are downstream via commands and events.
- **Codebase memory first.** Use the `codebase-memory-mcp` index (project `wegolite`) before grepping; confirm graph findings against source; fall back to `rg`, never `grep`.
- **Oolite reference checkout** at `/home/opencode/git/oolite`. Do not fetch Oolite over the network. Read behaviour from the checkout; consume data from `third_party/oolite/` and keep `CHECKSUMS.sha256` honest.
- **Licensing.** GPL-2.0-or-later code; Oolite-derived art/config CC BY-NC-SA 3.0 with provenance in `NOTICE`/`ASSETS.md`.
- **No OXP support**, no combat/NPC traffic in v1.
- **Browser proofs are probe assertions**, never screenshots (`?test=1`, `window.__wegolite`).
- **GSD workflow enforcement:** file-changing work goes through a GSD command.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Distance / fuel / jump-time arithmetic | Sim (pure module) | — | Deterministic, no DOM/content, unit-testable; WORLD-06 requires it there |
| Countdown timer (1800 steps) | Sim (`FlightState`) | — | D-06: fixed-step state, not an app timer; must freeze with pause and chart |
| Fuel deduction + clock advance | Sim emits facts; app mutates profile | Sim owns `clockSeconds` | D-07: fuel is profile state and must not enter `FlightState`; clock is sim state |
| 7 LY graph + chart projection | UI model (pure TypeScript under `src/ui`) | App supplies galaxy array | Pure data transform, unit-testable without canvas; renderer stays dumb |
| Chart painting, hit testing | Browser (Canvas2D overlay) | — | 875 edges + 256 labels is a static plot; paint-on-change avoids per-frame cost |
| Chart open/close suspension | App (`GameSession`) | Input contexts | The app owns the loop and the flag; the sim never learns about the chart |
| Target commitment + persistence | App state | Save schema v2 | D-12: game state, persisted; never inside the hashed sim state |
| System swap, market reseed | App composition root | `SceneManager` | Existing build-before-swap ownership; the sim receives the new layout each step |
| Arrival pose derivation | Sim (pure function) | App calls it after the swap | Deterministic and testable; the app supplies the destination layout |
| Save schema, migration, validation | Persistence layer | Sim only as types | Existing single pipeline; zod is already a dependency |
| Docked/in-flight restore | Persistence builds state; app installs it | `SceneManager` | Mirrors the boot path so F2 Load and Continue share one implementation |
| F2 screen, chart overlay chrome | Browser (DOM) | Input contexts | Same shell language as the station; no second `<footer>` |

**Tier rule for this phase:** anything that can be expressed as a number from `(flightState, profile, system, galaxy)` and has a fixture belongs in `src/sim` or a pure `src/ui/*-model.ts`. Anything that touches `document`, `canvas` or IndexedDB belongs in `src/app` / `src/ui` / `src/persistence`. The planner must reject a task that computes fuel cost inside a DOM renderer.

## Standard Stack

### Core

No new runtime dependencies. This phase is built entirely from what is already installed and pinned.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | 4.6.7 (locked, `package.json`) | v2 save schema, strict object, `.int()` bounds | Already the only schema library in `src/persistence/save.ts`; a second validator would fork the trust boundary |
| `vitest` | 5.0.5 | Unit tests for jump math, chart model, migration | Existing `npm test`; `vitest.config.ts` includes `src/**/*.test.ts` and `tests/**/*.test.ts` |
| `@playwright/test` | 1.64.1 | Browser proofs for chart/countdown/reload | Existing `npm run test:e2e`; probe-driven, no screenshots |
| `three` | 0.187.0 | Not used by this phase's new code | The hyperspace module must not import it (ESLint `no-restricted-imports` in `src/sim/**`) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Canvas2D (`CanvasRenderingContext2D`) | platform | Chart plot and fuel circle | Same precedent as the HUD and break-pattern; no dependency |
| `IndexedDB` | platform | The one `autosave` key | Existing `idb-store.ts`; do not add `idb`/`fake-indexeddb` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas2D chart | SVG (256 `<text>` + 875 `<line>`) | SVG gives free hit-testing but ~1,131 nodes to build/reflow on every selection change, and 256 focusable/aria nodes to suppress. Canvas needs one small pure hit-test function instead. Canvas wins on the existing codebase's precedent (`hud.ts`, `break-pattern.ts`) and on cost. |
| Canvas2D chart | DOM `<div>` per system (station-table style) | 256 absolutely-positioned divs; no per-node canvas bookkeeping, but reflow on every range toggle and awkward edge lines. Only viable if the team wants zero canvas code. |
| One `market` snapshot object | Per-system map of every visited market | Explicitly rejected by the owner (CONTEXT "Specific Ideas"); the save would grow without bound and reload semantics would change |
| `migrateV1ToV2` inside `parseSave` | A generic migration framework with a registry | No second version exists; one pure function per hop is simpler and matches "ordered pure functions" in D-14 |

**Installation:** none. `docker compose run --rm test` / `verify` need no image change, so no `docker compose down --volumes` is required this phase (unless a dev dependency is added — don't).

**Version verification:** no package is added, so no registry check applies. Existing versions were read from `package.json` this session (`zod 4.6.7`, `vitest 5.0.5`, `@playwright/test 1.64.1`, `three 0.187.0`).

## Package Legitimacy Audit

**This phase installs no external packages.** Every capability is built on platform APIs (Canvas2D, IndexedDB, `Math.trunc`/`Math.sqrt`) and existing pinned dependencies.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none added)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

*If implementation later reaches for a charting or pathfinding library, it must pass `gsd_run query package-legitimacy check --ecosystem npm <pkg>` and be tagged `[ASSUMED]` until an authoritative source confirms it. The default is: do not add one.*

## Architecture Patterns

### System Architecture Diagram

```
                        ┌───────────────────────────────────────────────┐
  keydown (F6/F2/H/…)   │  input/keyboard.ts                           │
  ─────────────────────▶│  codeToActions → ACTION_CONTEXTS filter      │
                        │  → EdgeCommands (Command[])                  │
                        │  → screen-open sink (synchronous context)    │
                        └───────────────┬───────────────────────────────┘
                                        │ Command[]
                                        ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ app/game-session.ts  (the only composition root)                         │
   │                                                                          │
   │  frame(now)                                                              │
   │   ├─ chartOpen || paused ?  (drain + skip advance + skip render)          │
   │   └─ loop.advance(delta, commands, step)                                 │
   │        └─ stepFlight(state, layout, config, intent, cmds, DT, {           │
   │             dock, equipment, hyperspace:{fuel, origin, target} })         │
   │             │                                                            │
   │             ├─ hyperspace/jump.ts      (pure integer math)               │
   │             ├─ hyperspace/countdown.ts (1800 steps)                      │
   │             └─ SimEvent[] ──────────────┐                                │
   │                                         ▼                                │
   │  handleEvent(event)                                                      │
   │   ├─ hyperspaceJumped ─▶ resolve System ─▶ scenes.enterSystem            │
   │   │                        ├─ chained market seed → generateMarket        │
   │   │                        ├─ applyWitchpointArrival(state, newLayout,…)  │
   │   │                        ├─ previousPose = currentPose = poseOf(state)  │
   │   │                        └─ snapshotForSave → queueAutosave             │
   │   ├─ docked ────────────▶ autosave (segment anchor)                       │
   │   └─ countdown events ──▶ messages.enqueue (app-owned copy)               │
   │                                                                          │
   │  profile / market / marketSeed / hyperspaceTargetId   (app-owned state)   │
   └───────────┬──────────────────────────────┬───────────────────────────────┘
               │                              │
               ▼                              ▼
   ┌────────────────────────┐     ┌─────────────────────────────────────────┐
   │ ui/chart.ts (DOM+Canvas)│     │ persistence/*                           │
   │  chart-model.ts (pure)  │     │  save.ts    (schema + migrate + validate)│
   │  ← galaxy0() 256 systems│     │  autosave.ts(snapshot / restore)         │
   └────────────────────────┘     │  idb-store.ts (one key, revisions)      │
                                  └───────────────┬─────────────────────────┘
   ┌────────────────────────┐                     │
   │ ui/save-load.ts (DOM)  │                     ▼
   │ ui/station.ts (F5 line)│             IndexedDB `autosave`
   └────────────────────────┘
```

Read the primary use case by following the arrows: F6 → chart model → Enter commits a target (app state) → close chart → H → command → countdown in the sim → `hyperspaceJumped` → new scene + market + pose + autosave.

### Recommended Project Structure

```
src/
├── sim/
│   └── hyperspace/
│       ├── jump.ts          # WORLD-06: dist, distanceLy, fuelCost, jumpTimeSeconds, MAX_JUMP_DIST
│       ├── countdown.ts     # 1800 steps, start/cancel/complete predicates, refusal reason enum
│       └── arrival.ts       # deterministic witchpoint offset + near-identity orientation
├── ui/
│   ├── chart-model.ts       # pure: projection, edges, ranges, selection, direction search, hit test
│   ├── chart.ts             # DOM shell + Canvas2D painting + pointer handling
│   ├── save-load.ts         # F2 overlay controller (Save / Load / Return + [Y/N])
│   └── station-model.ts     # F5 "Hyperspace System" now reads the committed target
├── persistence/
│   ├── save.ts              # SAVE_VERSION 2, SaveV2Schema, migrateV1ToV2, validator rules
│   └── autosave.ts          # snapshotForSave / restoreFromSave both modes
└── app/
    └── game-session.ts      # mutable system, chart suspension, system swap, F2 load, new autosave triggers
```

Tests:
```
tests/sim/hyperspace.test.ts        # fixtures + trunc/floor discriminators + range/refusal table
tests/sim/hyperspace-arrival.test.ts# pose determinism, clamping, no Math.random
tests/ui/chart-model.test.ts        # all 256, 875 edges, projections, selection, hit test
tests/persistence/save-v2.test.ts   # v2 accept/reject table, migration, bounds
tests/e2e/hyperspace.spec.ts        # chart → target → countdown → arrival → reload
tests/e2e/save-load.spec.ts         # F2 save/load, overwrite confirm, corrupt/future safety
```

### Pattern A: Integer-derived hyperspace math (WORLD-06)

**What:** One pure module that computes in *integer chart units* first, then derives every observable value by exact integer algebra.

**When to use:** always, for every distance/fuel/time consumer (chart readout, refusal, countdown commit, fuel deduction, jump time).

**Why the integer route is mandatory:** Oolite's formula produces a double, but Oolite's fuel tank is `OOFuelQuantity` = `uint16_t` (`src/Core/OOTypes.h:158`), so the double→integer conversion truncates. If Wegolite keeps the double, `70 - 10 × (0.4 × 14)` is `13.999999999999993`, which `SaveV1Schema.fuel` (`z.number().int()`) rejects — the arrival autosave would return `invalid-save` and the segment anchor would never be written.

```ts
// Source: /home/opencode/git/oolite/src/Core/legacy_random.h:154-160
//   int dx = x1 - x2;
//   int dy = (y1 - y2) / 2;
//   int dist = sqrt(dx * dx + dy * dy); // truncation is desired
//   return 0.4 * dist;
export const CHART_LY_PER_UNIT = 0.4;
export const MAX_JUMP_RANGE_LY = 7.0;
/** 17 x 0.4 = 6.8 <= 7.0; 18 x 0.4 = 7.2 > 7.0. Integer-exact range gate. */
export const MAX_JUMP_DIST = 17;

export interface JumpMath {
  readonly dist: number;          // integer chart units
  readonly distanceLy: number;    // display only
  readonly fuelCost: number;      // integer tenths of a LY (Oolite fuel units)
  readonly jumpTimeSeconds: number;
  readonly reachable: boolean;
}

export function chartDistance(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): number {
  const dx = from.x - to.x;
  // Math.trunc, never Math.floor: C integer division truncates toward zero.
  const dy = Math.trunc((from.y - to.y) / 2);
  return Math.trunc(Math.sqrt(dx * dx + dy * dy));
}

export function jumpBetween(from, to): JumpMath {
  const dist = chartDistance(from, to);
  return {
    dist,
    distanceLy: dist * CHART_LY_PER_UNIT,
    // 10 * max(0.1, 0.4d) == 4d for d >= 1; == 1 for d == 0.
    fuelCost: dist === 0 ? 1 : 4 * dist,
    // (0.4d)^2 * 3600 == 576 d^2 exactly.
    jumpTimeSeconds: 576 * dist * dist,
    reachable: dist <= MAX_JUMP_DIST,
  };
}
```

### Pattern B: Countdown as fixed-step state, facts through `StepOptions`

**What:** `FlightState` gains `hyperspaceCountdown` (steps remaining, `0` = idle) and `hyperspaceTarget` (the snapshot `{ id, dist }` taken when the countdown started). The app passes the live facts (fuel, origin coords, target coords) as read-only step options, exactly like `equipment`.

**When to use:** for the start, tick, cancel and completion of a jump — never an app-side `setInterval`.

```ts
// src/sim/flight/step.ts — StepOptions today (lines 36-44) then extended
export interface StepOptions {
  readonly dock?: DockGeometry;
  readonly equipment?: ReadonlySet<string>;
  /** Phase 6: read-only hyperspace facts. Fuel never enters FlightState (D-07). */
  readonly hyperspace?: {
    readonly fuel: number;
    readonly origin: { readonly id: string; readonly x: number; readonly y: number };
    readonly target?: { readonly id: string; readonly x: number; readonly y: number };
  };
}
```

Step order inside `stepFlight` (extend the existing 1-7 pipeline in `src/sim/flight/step.ts:82-177`, do not reorder it):

```
1  drain commands          beginHyperspace / cancelHyperspace (payload-free)
2  mode transition         unchanged
3  attitude                unchanged — pitch/roll live during countdown (D-06)
4  torus/speed             unchanged — speed and torus live during countdown
4b countdown tick          only when mode==="inFlight" && countdown>0
                           countdown -= 1; on 0 -> commit:
                             revalidate (target snapshot, dist<=17, fuel>=cost)
                             state.clockSeconds += jumpTimeSeconds
                             emit { kind:"hyperspaceJumped", destinationId, clockDeltaSeconds }
                             terminalTransition = true   ← MUST suppress step 5's +dt
5  clock/stationAngle      `if (modeAtStart !== "docked" && !terminalTransition)`
6  docking                 unchanged
7  tick += 1
```

**The `terminalTransition` flag is load-bearing.** It already exists for launch and computer docking (`step.ts:76-79`, `:152`). Without setting it on the jump commit, the clock becomes `jumpTimeSeconds + 1/120` and the fixture `112896` fails.

**Off-by-one guard for the 15.0 s contract.** `beginHyperspace` is drained in step 1 of its step, and step 4b runs in that *same* step. Two equally correct encodings exist; pick one and pin it:

- set `countdown = HYPERSPACE_COUNTDOWN_STEPS` (1800) in step 1 **and skip 4b on that step** (`startedThisStep` flag, the same shape as the existing `launchedThisStep`), or
- set `countdown = 1801` in step 1 and always decrement.

The invariant to assert in a unit test is the observable one: from the step that drains `beginHyperspace`, the commit happens **exactly 1800 steps later**, i.e. `deltaClock === 1800 * DT` from the start step's post-`dt` clock, and `hyperspaceCountdown` is `0` on the commit step and never negative. A one-step error is 8.33 ms and invisible in play but fails an exact-fixture assertion, so pin it deliberately rather than by luck.

**Countdown copy is a message-line override, not a queued message (D-11).** The message queue expires entries after 4 simulated seconds (`MESSAGE_DURATION_SECONDS` in `src/render/hud/messages.ts`), so enqueuing "to Diso in 15" once will vanish mid-countdown and re-enqueueing every step floods the four-entry cap. Instead override the message *argument* where `buildHudModel` is called (`game-session.ts:1489-1495`):

```ts
const countdownText =
  state.hyperspaceCountdown > 0 && state.hyperspaceTarget !== null
    ? `Hyperspace to ${nameOf(state.hyperspaceTarget.id)} in ${String(
        // Oolite rounds: int seconds = round(witchspaceCountdown)
        Math.round(state.hyperspaceCountdown * DT),
      )} seconds`
    : undefined;
const message = countdownText ?? messages.current(state.flightTime);
const model = buildHudModel(state, layout, config, message, flash);
```

The sim emits `hyperspaceCountdownStarted`/`Cancelled`/`hyperspaceJumped` so the app can enqueue the one-shot copy (started/aborted/arrived) through the normal queue; only the live countdown line is an override.

### Pattern C: Pure chart model, dumb canvas, paint on change

**What:** `chart-model.ts` turns `(systems, currentId, targetId, range, fuel, viewport)` into a list of drawable primitives (`markers`, `edges`, `labels`, `circle`) plus selection helpers. `chart.ts` only draws them and routes pointer events.

**Projection (the part that is easy to get wrong).** Oolite's `vscale` carries a factor of 2 in the denominator (`GuiDisplayGen.m:1574-1575`): `double vscale = -size_in_pixels.height / (2 * CHART_HEIGHT_AT_MAX_ZOOM * zoom);`. The `/2` exists because the distance formula halves Δy, so **two** chart-y units span **one** distance unit: the visible y-chart span is `2 × 64 × zoom` against an x span of `64 × zoom`. Oolite then stretches that 2:1 chart rectangle to fill the viewport, which makes its chart pixels anisotropic (the fuel oval is drawn with an explicit `2 ×` height factor at `GuiDisplayGen.m:1754` for exactly that reason).

Wegolite should instead **letterbox a 2:1 chart area** and map both axes isotropically, so the fuel range is a true circle (D-04 says "circle") and the drawn distance between two systems is proportional to their jump distance:

```ts
// k = pixels per chart-x unit. Two chart-y units = one distance unit = k px.
// Fit the widest 2:1 rectangle that fits the viewport, then centre it.
const k = Math.min(viewport.width / chartSpanX, viewport.height / (chartSpanY / 2));
screenX = originX + (x - centreX) * k;
screenY = originY - ((y - centreY) / 2) * k;   // /2 = distance-space squash; minus = north-up
```

With that mapping a `fuel / 4` chart-x radius and a `fuel / 2` chart-y radius render as a true circle: Oolite computes `fuel = 35.0 * dialFuel` (full tank → 35), passes `NSMakeSize(fuel * hscale, 2 * fuel * vscale)` to `GLDrawOval` (`GuiDisplayGen.m:1571`, `:1754`), and `GLDrawOval` treats `siz` as the full width/height (`ww = 0.5 * siz.width`, `OOOpenGL.m`), so the radius is `fuel/4` chart-x units = `fuel/10` LY. **Do not derive the circle from a pixel radius; derive it from chart units.**

Measured galaxy-0 geometry (this session, from `src/content/generated/systems/g0.json`):

| Property | Value |
|---|---|
| Systems | 256 (`id` `g0-s0`..`g0-s255`, array index = `systemIndex`) |
| x extent | 2..253 |
| y extent | 0..254 |
| Edges at `dist ≤ 17` (trunc) | **875** (avg degree 6.84) |
| Edges at `dist ≤ 17` (`Math.floor` variant) | 866 — a single wrong rounding changes the graph |
| Lave (20,173) neighbourhood | Leesti 3.6, Diso 3.6, Reorte 4.4, Zaonce 5.6, Riedquat 6.8, Orerve 6.8; Quator 7.2 is out |
| Short-range window that covers every 7 LY neighbour | half-width ≥ 18 distance units → use 20 in x (chart span 40) and 20 in y (chart span 80) |
| Long-range window | whole galaxy: 256 chart-x units × 256 chart-y units, i.e. 256 × 128 in distance space (2:1) |

### Pattern D: v2 save — one schema, one migration, one validator

**What:** `SAVE_VERSION = 2`; `SaveV2Schema` replaces `SaveV1Schema` as the *current* schema; `SaveV1Schema` stays exported as the migration input; `parseSave` dispatches on the numeric `version`.

**Order is the contract** (preserve `src/persistence/save.ts:215-284` verbatim in shape):

```
raw === null                        → absent
raw.length > MAX_SAVE_CHARS         → sniff version → >2 ? future-version : unreadable
JSON.parse throws                   → unreadable
object with version > 2             → future-version
object with no numeric version      → unreadable
version === 1                       → SaveV1Schema.safeParse → fail ⇒ corrupt; ok ⇒ migrateV1ToV2
version === 2                       → SaveV2Schema.safeParse → fail ⇒ corrupt
validateSaveSemantics(save, allow, "read") → false ⇒ corrupt
!allow.systems.has(save.system.id)  → corrupt
!allow.stations.has(save.station.key) → corrupt
```

Migration (pure, total, no I/O):

```ts
export function migrateV1ToV2(v1: SaveV1): SaveV2 {
  return {
    ...v1,
    version: 2,
    mode: "docked",
    // D-14: keep the seed, leave the snapshot absent so the session can
    // generate it from this seed before the first write.
    marketSeed: v1.marketSeed ?? marketSeedForSystem(v1.system.id),
    // no `market`, no `flight`
  };
}
```

Note: `marketSeedForSystem` lives in `src/sim/economy/market.ts` and `save.ts` already imports from `src/sim` (`CLOCK_START`, cargo helpers), so this is an acceptable dependency direction (persistence → sim types/functions, never the reverse).

### Pattern E: system swap in the composition root

**What:** `let system: System` instead of a captured `options.system`; one `enterSystemById(id)` helper used by hyperspace departure, F2 Load and the boot restore.

```ts
function enterSystemById(id: string): { layout: SystemLayout; scene: SystemScene } {
  const next = galaxyById.get(id);            // Map<string, System>, built at start()
  if (next === undefined) throw new Error(`unknown system ${id}`);
  const nextScene = scenes.enterSystem(next, stationDef);
  const nextLayout = scenes.layout();
  if (nextLayout === undefined) throw new Error("enterSystem without a layout");
  system = next;                              // must be `let`, not the option
  scene = nextScene;                          // build-before-swap already happened
  layout = nextLayout;
  previousCameraWorld = undefined;            // new dust field has no history
  return { layout: nextLayout, scene: nextScene };
}
```

`scenes.enterSystem` disposes the old scene *after* installing the new one (`scene-manager.ts:126-139`), which is exactly D-09's "builds the new scene before swapping". `dockGeometry` must **not** be rebuilt: its only layout input is `systemLayout.dockOffset`, which comes from the station catalogue entry (`layout.ts:151-165`), not from the system.

### Pattern F: overlays that respect the existing shell

**What:** two new full-screen siblings of `#docked` in `index.html`, both opaque, both `z-index: 10`; the pause overlay already sits at `z-index: 20` (`index.html:336-340`).

- `#chart` — header (`Galactic chart — short/long range`), one `<canvas id="chart-canvas">`, a footer-style text block (`target`, `distance`, `fuel cost`, key hints). **No `<footer>` element** (Phase 5 decision; `body > footer` CSS scoping depends on it).
- `#save-load` — header, one slot line (`Autosave — <system> — <clock>`), three buttons (`Save`, `Load`, `Return`), one `[Y/N]` confirmation line.

Rules to copy from `src/ui/station.ts`: `textContent` only; non-focusable rows; one writer per footer field; rows are `div`/`td`, never buttons (so native Enter/Space cannot bypass the action layer).

### Anti-Patterns to Avoid

- **Computing fuel cost in the chart/UI as a float and passing it to the sim.** The chart readout is display-only; the deduction path must recompute from `dist` in the sim or use the event's `clockDeltaSeconds`-sibling `fuelCost`.
- **Putting the target id or the fuel in `FlightState` for convenience.** `FlightState` is hashed and persisted-adjacent; D-07/D-12 split them deliberately.
- **A second `parseSave`/validator for F2 Load.** D-16: one validator for boot, autosave writer, migration output and F2.
- **An app-side `setTimeout` for the countdown.** It would ignore pause, the chart freeze, and the fixed step.
- **Rebuilding `dockGeometry` or `hud`/`breakPattern` on a system swap.** Only the scene and layout change.
- **Calling `autosave()` inside the countdown or on every frame.** D-17: segment anchors only.
- **Adding a HUD element for the target.** The HUD set is pinned to eleven elements by `tests/e2e/hud.spec.ts:109` ("the HUD set is the eleven v1 elements"); see Open Question 2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distance on a 256-system chart | Euclidean `hypot` or pixel distance | `chartDistance` (integer formula) | Oolite's quantisation *is* the connectivity: `hypot` changes which systems are reachable (866 → 875 edges, plus 4,236 pairs differ) |
| Fuel/tank arithmetic | `profile.fuel - 10 * Math.max(0.1, ly)` | `fuelCost` from `jumpBetween` (`4 * dist`) | Float residue (`13.999999999999993`) fails the integer schema and kills the arrival save |
| Jump time | `ly * ly * 3600` | `576 * dist * dist` | `(0.4 × 14)² × 3600` = `112896.00000000003`; the exact integer is `112896` |
| Versioned JSON validation | A hand-rolled validator or a second library | `zod` `strictObject` + the existing `validateSaveSemantics` | The order and classification (`corrupt` vs `unreadable` vs `future-version`) is already proven and browser-tested |
| IndexedDB writes | A new promise wrapper / `idb` | `SaveStore` + `queueAutosave` | Commit-on-`oncomplete`, monotonic revisions, never-fatal semantics already exist |
| Deterministic randomness | `Math.random`, `Date.now` | `fnv1a32` (hex) → `parseInt → >>> 0`, `createSeededRandom` | Replayability is a project invariant; both helpers already exist |
| Scene teardown on arrival | Manual geometry disposal | `SceneManager.enterSystem` | WORLD-04 disposal is already proven by `tests/e2e/dispose.spec.ts` |
| Arrow-key "nearest in direction" | Ad-hoc pixel search | A pure comparator in `chart-model.ts` | Must be deterministic and unit-testable; ties need an explicit rule (`systemIndex`) |

**Key insight:** every hard number in this phase already has an authoritative source — the Oolite checkout for behaviour, the compiled content for geometry, and existing pure modules for randomness and hashing. The work is wiring, not invention.

## Runtime State Inventory

This phase is partly a **wire-format migration** (v1 → v2) plus a **location change** (Lave-only → any galaxy-0 system). Everything below was checked against the tree; blank categories are stated explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | One IndexedDB record: db `wegolite`, store `saves`, key `autosave` (`src/persistence/store.ts:48-52`), plus `autosave.corrupt`. A v1 blob has `version: 1`, `mode: "docked"`, optional `cargo`/`fuel`/`missiles`/`passengerBerths`/`marketSeed`. It carries **no** pose, **no** market goods, **no** target. | **Data migration** at read time (`migrateV1ToV2`, pure, in memory). The blob is rewritten in v2 only on the next autosave; boot must not rewrite it. No offline/backfill job — the client is the only writer. |
| **Live service config** | None. No server, no external service, no dashboard, no workflow engine. Saves are per-origin browser state only. | None. |
| **OS-registered state** | None. No Task Scheduler, launchd, systemd, pm2 or Docker volume keyed by the save shape. The only Docker volumes are `wegolite-node-modules` (image-derived) and the bind mount. | None. |
| **Secrets/env vars** | None. `AGENTS.md` names `VITE_USE_POLLING` only (dev hot reload). No secret name references the save schema, key names or system ids. | None. |
| **Build artifacts / installed packages** | `dist/` is regenerated by `npm run build`. Nothing embeds a save shape at build time. `src/content/generated/*` is content, not saves; v2 reads the same `systems/g0.json`. `tests/golden/market/*.json` are market *fixtures* (unrelated to the save, but the market snapshot shape reuses `Market`). | Rebuild `dist` in `verify`. No package reinstall and therefore **no** `docker compose down --volumes` needed. |
| **Cross-origin / other tabs** | One IndexedDB database is shared by every tab of the origin; the store serialises per-connection but not across connections (`idb-store.ts`). Two tabs open on one save can interleave revisions. | Out of scope for v1 (single-player, one tab). Record as a known limitation; do not build cross-tab locking. |

**Canonical question — "after every file in the repo is updated, what runtime systems still have the old string/version cached, stored or registered?"** Only the user's browser IndexedDB can hold a v1 blob, and the read-time migration is the complete answer. There is no second store, no cache and no service to update.

## Common Pitfalls

### Pitfall 1: Float fuel residue kills the arrival autosave (severity: critical)

**What goes wrong:** `profile.fuel - 10 * Math.max(0.1, 0.4 * dist)` returns `13.999999999999993` for Lave→Zaonce (dist 14). `queueAutosave` runs `isEncodedSaveValid`, the v2 schema rejects a non-integer `fuel`, the write returns `invalid-save`, and the post-jump segment anchor is **never written**. The player reloads and loses the jump — the exact failure SAVE-05/SAVE-06 exist to prevent.
**Why it happens:** `0.4 * 14 = 5.6000000000000005`; `× 10 = 56.00000000000001`; `70 − 56.00000000000001` loses a bit.
**How to avoid:** derive the cost as an integer (`4 * dist`, `1` for dist 0) and subtract integers. Add a unit test that asserts `fuel - cost` is `Number.isSafeInteger` for every `dist` in `0..17` and that the four reachable fixtures leave `34`, `34`, `14`, `2` fuel (Diso, Leesti, Zaonce, Riedquat); Tibedied is refused as `too far`.
**Warning signs:** `probe.save.skipReason === "invalid-save"` after a jump; `probe.economy.fuel` is fractional; the reload returns to the station instead of the witchpoint.

### Pitfall 2: `Math.floor` instead of `Math.trunc` (severity: critical)

**What goes wrong:** `(y1 - y2) / 2` in C truncates toward zero. `Math.floor(-0.5)` is `-1`; `Math.trunc(-0.5)` is `0`. For Legees (4,253) → Laeden (4,254) the correct distance is **0** (`0.0 LY`, fuel **1**, jump time **0**); with `Math.floor` it is 0.4 LY / 4 fuel / 0.16 h. Galaxy 0 loses 9 edges (875 → 866) and 4,236 of 32,640 pairs change.
**Why it happens:** JS `Math.floor` is the reflex for "integer division".
**How to avoid:** `Math.trunc` with a comment naming C integer division. Fixtures: `Legees→Laeden` = `{dist:0, distanceLy:0, fuelCost:1, jumpTimeSeconds:0}`; galaxy-0 edge count = **875**.
**Warning signs:** a zero-distance pair is unreachable; the chart draws 866 edges.

### Pitfall 3: The market allow-list has 16 keys, the market has 17 (severity: high)

**What goes wrong:** validating `save.market.goods[].key` against `SaveAllowLists.commodities` rejects `alien_items`, which `generateMarket` always emits (17 goods). Every in-flight/docked v2 save becomes `corrupt` on reload and is copied to `autosave.corrupt`.
**Why it happens:** `main.ts:147-151` builds `commodities` from `commodities.filter((item) => item.tradeable && item.key !== "alien_items")` — correct for *cargo*, wrong for *market goods*.
**How to avoid:** add a distinct `marketGoods: ReadonlySet<string>` (all 17 keys) to `SaveAllowLists`, built from `loadCommodities()` without the tradeable filter. Keep `commodities` (16, with units) for cargo/pod accounting.
**Warning signs:** `tests/sim/economy/market.test.ts:144` (17 goods) passes while a save round-trip fails.

### Pitfall 4: `version: 2` is already the "future" version in the browser tests (severity: high)

**What goes wrong:** `tests/e2e/autosave.spec.ts:479` and `:684` inject `{ version: 2, …, futureBuild: "leave this alone" }` and assert `status === "future"` plus byte identity. Once `SAVE_VERSION` is 2, those blobs are *corrupt v2* (unknown key `futureBuild`), so the tests fail and — worse — a real "future" blob assertion disappears.
**Why it happens:** the future-version fixture was written against the then-current v1.
**How to avoid:** move both to `version: 3` and keep the oversized padding derived from the (new) `MAX_SAVE_CHARS`. Add a *new* v2-with-unknown-key case under the corrupt table.
**Warning signs:** the future tests turn red at the same time as the migration lands.

### Pitfall 5: The jump-commit step also adds `dt` to the clock (severity: high)

**What goes wrong:** the clock becomes `46656 + 1/120` instead of `46656`; fixtures fail, and the save's floored clock is off by a second at the boundary.
**Why it happens:** step 5 of `stepFlight` adds `dt` whenever `modeAtStart !== "docked"` (`step.ts:152`).
**How to avoid:** set the existing `terminalTransition` flag on the commit step, exactly as launch and computer docking do (`step.ts:76-79`, `:101`, `:152`). Assert `clockSeconds` deltas of exactly `46656`, `46656`, `112896`, `166464`, `0`.

### Pitfall 6: The pre-launch snapshot taken from the wrong side of `beginLaunch` (severity: high)

**What goes wrong:** today the only launch autosave happens in the `launched` handler, *after* `beginLaunch` added +600 s (`game-session.ts:1214-1229`). D-17 requires the snapshot **before** the transition, while docked. If both remain, reload after a launch lands at +600 s in `launching`-adjacent state, contradicting "returns to the station before launch".
**How to avoid:** in `frame()`, before `currentLoop.advance(delta, commands, …)`, detect `commands.some(c => c.kind === "launch") && state.mode === "docked" && stationScreen === "home"` and call `autosave()`; delete the `autosave()` from the `launched` case. Update the Phase 4 assertion that the launch save records +600 s (STATE.md "Plan 04-05" decision) — that record is superseded by D-17.
**Warning signs:** `probe.save.lastClock` after a launch equals `CLOCK_START + 600`.

### Pitfall 7: `restoreFromSave` leaves `dockArmed`/`stationAngle` at docked values for an in-flight restore (severity: medium)

**What goes wrong:** `initFlightState` sets `dockArmed: true`, `stationAngle: 0`, `launchCount: 0`. A witchpoint restore inherits them. `dockArmed: true` at 12 km from the station is a latent corridor/contact inconsistency; `stationAngle: 0` snaps the visible station rotation on reload (harmless but detectable in a pose comparison test).
**How to avoid:** in the in-flight branch set `mode = "inFlight"`, `dockArmed = false`, `stationAngle = 0` (explicitly derived, not persisted — D-13 does not store it), `launchElapsed = LAUNCH_DURATION`, `impulse = 0`, `compassMode = "auto"`. Document that `dockCount`/`launchCount`/`bounceCount` reset on an in-flight restore (they are probe counters, not contract).
**Warning signs:** `probe.dock.outcome` flips to something odd after Continue; a reload of an arrival save reports `dockArmed` true in a hidden test.

### Pitfall 8: `state.position` from a save is finite but absurd (severity: medium)

**What goes wrong:** `sanitizeFlightState` only repairs **non-finite** positions (`sanitize.ts:45-48`). A tampered save with `position: [1e30, 0, 0]` is schema-valid if the schema only says "finite", and the renderer/camera arithmetic degrades (log-depth precision, dust wrap).
**How to avoid:** bound the pose in the schema/validator, not only in `sanitizeFlightState`: `|position| ≤ 1e9` m, `speed ∈ [0, 1_000_000]` (torus cap is `350 × 1024 = 358_400`), `|pitchRate|,|rollRate| ≤ 10`. Normalise orientation on read (D-16) and require `0 < length² ≤ 4`.
**Warning signs:** a fuzz case passes the schema then produces `world.maxRelativeMagnitude` in the millions.

### Pitfall 9: Two seeds in one save (severity: medium)

**What goes wrong:** D-13 says v2 *adds* `seed` to the market snapshot while *preserving every v1 field* (which includes `marketSeed`). Writing both invites divergence: a hand-edited save where `marketSeed` and `market.seed` disagree makes "which prices does reload use?" ambiguous.
**How to avoid:** exactly one seed per encoding. Migration output: `marketSeed` set, `market` absent. Canonical writer: `market.seed` set, `marketSeed` omitted. Validator: `market` present ⇒ `marketSeed` must be absent; `market` absent ⇒ `marketSeed` must be present. That satisfies D-13's semantic content and D-14's "leaves the market snapshot absent" without duplication.
**Warning signs:** a restore that generates the market instead of using the snapshot (or vice versa).

### Pitfall 10: The chart re-renders 256 labels every frame on SwiftShader (severity: high for the phase gate)

**What goes wrong:** the loaded frame is already ~369 ms under SwiftShader (STATE.md G-03-3). A chart that repaints inside `renderFrame` adds hundreds of ms and pushes e2e specs past their ceilings.
**How to avoid:** the chart is a **static plot**: paint on open, on selection change, on range toggle and on resize — never per animation frame. While the chart is open, skip `renderFrame` entirely (the overlay is opaque). The existing "repaint once per non-zero resize" precedent is Plan 01-07's decision.
**Warning signs:** `probe.renders` climbing while `probe.chart.open` is true; e2e timeouts that only appear with the chart open.

### Pitfall 11: Label overlap makes the long-range chart unreadable (severity: medium)

**What goes wrong:** 256 names over ~1120 × 560 px collide heavily (~48 px average spacing, 6–12 character names). Oolite itself does not draw 256 names at its widest zoom either: it draws names only when `zoom > CHART_ZOOM_SHOW_LABELS (2.0)` and uses a limited `nearby_systems` list below that (`GuiDisplayGen.m:1913-1918`, `:1954-1962`, `PlayerEntity.h:106`).
**How to avoid:** deterministic overlap skipping — iterate systems in `systemIndex` order, draw a label only when its measured box does not intersect an already-drawn box; always draw the current system and the target regardless. This satisfies D-04 ("marked without hiding their names" = names are not suppressed by *reachability*) while staying legible.
**Warning signs:** a wall of overlapping text in the smoke check.

### Pitfall 12: Escape/P handling in new contexts (severity: medium)

**What goes wrong:** `Escape` is bound to `pause` and the docked sections get it back via a hard-coded exception (`keyboard.ts:178`: `if (context === "dockScreen" && code === "Escape") continue;`). A new `chart`/`saveScreen` context without that exception gets pause-toggle on Escape instead of "close".
**How to avoid:** generalise the exception to the panel contexts (`context !== "flight"`) or enumerate `["dockScreen","chart","saveScreen"]`, keep `KeyP` as the universal pause, and add `chartBack` / `saveScreenReturn` bound to `Escape` with only the new context. Assert with a unit test on `createInputState` (context `chart` + `Escape` must not raise `pauseToggle`).
**Warning signs:** Escape opens the pause overlay on top of the chart; P does nothing in the chart.

### Pitfall 13: The chart opens during `launching` (severity: medium)

**What goes wrong:** D-01 says F6 is ignored during the launch cinematic. The `launching` mode runs the break-pattern and the scripted camera; a chart overlay there breaks the handover and the launch skip.
**How to avoid:** gate the chart open on `state.mode !== "launching"`; the open sink revalidates the live mode like `openStationScreen` does (`game-session.ts:1041-1045`).
**Warning signs:** the break pattern freezes under the chart; `launchSeen` never flips.

### Pitfall 14: The in-session Load builds a scene then fails to restore (severity: high)

**What goes wrong:** D-22 says a failed load must leave the current session untouched. If `enterSystemById` runs before the save is fully validated/normalised (orientation, market), a throw leaves a half-swapped session.
**How to avoid:** validate first (the save is already parsed/validated at the call site), then build the scene, then install state in one synchronous block with no early returns between `enterSystem` and the state assignment. Mirror the boot order in `start()` (`game-session.ts:1703-1733`): state first, then profile, market, poses, HUD visibility.
**Warning signs:** the station UI stays hidden after a failed load; `probe.mode` disagrees with `probe.station.open`.

### Pitfall 15: Rebinding/settings blobs lose the new keys (severity: low)

**What goes wrong:** `parseSettings` fails the whole blob on an unknown action id, and `SETTINGS_VERSION` is 1. Adding `chart`/`hyperspace`/`saveLoad`/… does **not** invalidate old blobs (missing actions take defaults in `createBindingMap`), but an *old build* reading a *new* blob will see unknown actions and fall back to defaults.
**How to avoid:** no settings version bump is needed (missing-action tolerance already handles the forward direction). Record the same caveat Phase 5 recorded. Add the new actions to `ACTION_LABELS` and to `DEFAULT_BINDINGS`; verify `createBindingMap` conflict resolution keeps `ArrowUp` usable in `flight`, `dockScreen` and `chart` simultaneously (contexts are disjoint, so it should).
**Warning signs:** `bindings.test.ts` conflict cases start failing because a new action shares a code with an overlapping context.

### Pitfall 16: `probe` shape changes break the probe-lock/guard assumptions (severity: low)

**What goes wrong:** `src/app/probe.ts` is a single published object mutated in place; `publishFailure` must carry every non-optional field. Adding required fields to `WegoliteProbe` without updating `publishFailure` fails typecheck in the failure path.
**How to avoid:** make every new probe group optional (`chart?`, `hyperspace?`) like `world?`, `dock?`, `station?`; publish them from `updateProbe()` only when a session exists.
**Warning signs:** `tsc` errors in `probe.ts:362-397`.

## Code Examples

### Exact fuel/time identity check (run before trusting any fixture)

```ts
// Observed in this session with node:
// 0.4 * 14 = 5.6000000000000005
// (0.4 * 14) ** 2 * 3600 = 112896.00000000003
// 70 - 10 * Math.max(0.1, 0.4 * 14) = 13.999999999999993   ← non-integer
// 576 * 14 * 14 = 112896                                    ← exact
// 4 * 14 = 56                                               ← exact
```

### Deterministic witchpoint arrival (D-08)

```ts
// src/sim/hyperspace/arrival.ts
// Oolite: src/Core/Entities/PlayerEntity.m:6913-6969
//   d1 = SCANNER_MAX_RANGE * ((Ranrot() & 255) / 256.0 - 0.5);
//   min_d1 = safeWitchspaceExitDistance (buoy radius + MIN_DISTANCE_TO_BUOY 750)
//   if (abs(d1) < min_d1) d1 += (d1 > 0 ? min_d1 : -min_d1);
//   position = exit + forward(q1) * d1;  orientation = getWitchspaceExitRotation();
//   flightSpeed = fmin(maxFlightSpeed, 50.0f); flightRoll/flightPitch = 0;

export const ARRIVAL_SPEED = 50;          // Oolite's fmin(maxFlightSpeed, 50.0f)
export const OOLITE_ORIENTATION_EPSILON = 1 / 1024; // Universe.m:8785-8788

/** Stable seed for one route; never Math.random, never the clock. */
export function arrivalWord(originId: string, destinationId: string): number {
  return Number.parseInt(fnv1a32(`${originId}>${destinationId}:arrival`), 16) >>> 0;
}

export function applyWitchpointArrival(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  originId: string,
  destinationId: string,
): void {
  // One route -> one word; byte slices are independent because FNV-1a
  // avalanches. Use distinct slices, never the same bits twice.
  const word = arrivalWord(originId, destinationId);
  const uMagnitude = (word & 0xffff) / 0x10000;            // [0, 1)
  const uAngle = ((word >>> 16) & 0xffff) / 0x10000;       // [0, 1)
  const safe = layout.witchpoint.radius + 750;             // 760 for radius 10
  const span = layout.scannerRange * 0.5;                  // 12,800
  const magnitude = safe + uMagnitude * (span - safe);
  const angle = uAngle * Math.PI * 2;
  state.position = vec(
    layout.witchpoint.position.x + Math.cos(angle) * magnitude,
    layout.witchpoint.position.y + Math.sin(angle) * magnitude,
    layout.witchpoint.position.z,
  );
  // The planet always lies on -Z from the witchpoint (layout.ts:127), so the
  // Oolite near-identity orientation already faces it; add the tiny tilt.
  const tilt = (slice: number) =>
    (((word >>> slice) & 0xff) - 128) * OOLITE_ORIENTATION_EPSILON;
  state.orientation = normalize(quat(1, tilt(24), tilt(16), tilt(8)));
  state.speed = Math.min(config.maxSpeed, ARRIVAL_SPEED);
  state.pitchRate = 0;
  state.rollRate = 0;
  state.torus = { engaged: false, factor: 1, massLocked: false, lastFactor: 1 };
  state.mode = "inFlight";
  state.dockArmed = false;
}
```

### v2 schema skeleton (field names are the planner's choice; semantics fixed)

```ts
export const SAVE_VERSION = 2 as const;

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
const QuatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const MarketGoodSchema = z.strictObject({
  key: z.string().min(1).max(MAX_SAVE_EQUIPMENT_KEY_CHARS),
  price: z.number().int().min(0).max(MAX_SAVE_CREDITS),
  stock: z.number().int().min(0).max(127),           // MARKET_LIMIT
});

const MarketSchema = z.strictObject({
  systemId: z.string().min(1).max(MAX_SAVE_SYSTEM_ID_CHARS),
  seed: z.number().int().min(0).max(0xffffffff),
  goods: z.array(MarketGoodSchema).length(17),        // exactly the 17 commodity keys
});

const FlightPoseSchema = z.strictObject({
  position: Vec3Schema,
  orientation: QuatSchema,
  speed: z.number().min(0).max(1_000_000),
  pitchRate: z.number().min(-10).max(10),
  rollRate: z.number().min(-10).max(10),
  torus: z.boolean(),
});

export const SaveV2Schema = z.strictObject({
  version: z.literal(SAVE_VERSION),
  mode: z.enum(["docked", "inFlight"]),
  clockSeconds: z.number().int().min(CLOCK_START).max(CLOCK_START + MAX_SAVE_CLOCK_DELTA),
  credits: z.number().int().min(0).max(MAX_SAVE_CREDITS),
  equipment: z.array(z.string().min(1).max(MAX_SAVE_EQUIPMENT_KEY_CHARS)).max(MAX_SAVE_EQUIPMENT),
  system: z.strictObject({ id: z.string().min(1).max(MAX_SAVE_SYSTEM_ID_CHARS) }),
  station: z.strictObject({ key: z.string().min(1).max(MAX_SAVE_STATION_KEY_CHARS) }),
  cargo: z.array(CargoEntrySchema).max(MAX_SAVE_CARGO_ENTRIES).optional(),
  fuel: z.number().int().min(0).max(MAX_SAVE_FUEL).optional(),
  missiles: z.number().int().min(0).max(MAX_SAVE_MISSILES).optional(),
  passengerBerths: z.number().int().min(0).max(MAX_SAVE_BERTHS).optional(),
  marketSeed: z.number().int().min(0).max(0xffffffff).optional(), // migration-only encoding
  market: MarketSchema.optional(),                                // canonical encoding
  targetSystem: z.string().min(1).max(MAX_SAVE_SYSTEM_ID_CHARS).optional(),
  flight: FlightPoseSchema.optional(),                            // required iff mode === "inFlight"
});
```

### Save-size bound arithmetic (justifies raising to 65,536)

Worst case with the schema caps: equipment `64 × 64 chars × 6` (JSON `\u00XX` escaping) = **24,576**; cargo `17 × (64×6 + 8)` ≈ **6,664**; market `17 × (64×6 + ~28)` ≈ **7,004**; pose ≈ **250**; scalar/id/station envelope ≈ **400**. Total ≈ **38,894** characters, comfortably under `65_536` while remaining a hard pre-`JSON.parse` bound. Update the `MAX_SAVE_CHARS` doc comment (`save.ts:46-58`), which currently reasons only about v1.

### Chart selection: nearest in a direction (pure, deterministic)

```ts
// src/ui/chart-model.ts
export function nearestInDirection(
  systems: readonly System[],
  current: System,
  dirX: number,
  dirY: number,
): System | undefined {
  let best: System | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of systems) {
    if (candidate.id === current.id) continue;
    const dx = candidate.chartX - current.chartX;
    const dy = (candidate.chartY - current.chartY) / 2; // distance space
    const forward = dx * dirX + dy * dirY;
    if (forward <= 0) continue;                        // must make progress
    const lateral = Math.abs(dx * dirY - dy * dirX);   // perpendicular offset
    // Prefer straight ahead, then near; ties broken by systemIndex.
    const score = lateral * 1000 + forward + candidate.systemIndex * 1e-6;
    if (score < bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}
```

### F2 Load: reuse the boot restore (D-22/D-23)

```ts
// The same call the title's Continue path makes.
const parsed = parseSave(await store.read().then(r => r.kind === "ok" ? r.raw : null), allow);
if (!parsed.ok) { notice = loadFailureCopy(parsed.reason); return; }  // session untouched

const restored = restoreFromSave(parsed.save, layoutFor(parsed.save.system.id), profileFromSave);
const { layout: nextLayout, scene: nextScene } = enterSystemById(parsed.save.system.id);
applyRestoredState(restored);         // state, profile, market, targetSystem
resetPanels();                        // station home, chart closed, F2 closed
autosave();                           // or leave the blob as-is; see Open Question 4
resume();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1 save: docked-only, `mode: z.literal("docked")`, seed-only market | v2 save: docked **or** in-flight, market snapshot, target | Phase 6 (this phase) | One ordered migration; older blobs remain readable |
| Autosave on launch (post-`beginLaunch`, +600 s) and on purchase | Segment anchor: pre-launch docked, on dock, on arrival, on trade/fit, manual F2 | Phase 6 (D-17 supersedes the Phase 4 record) | Reload returns to the start of the leg; +600 s launch save is gone |
| `system` captured once at `createGameSession` (always Lave) | Mutable session system resolved by id from galaxy 0 | Phase 6 | Hyperspace, Continue and F2 Load share one resolution path |
| Market regenerated only at boot from `marketSeedForSystem` | Chained seed on every arrival (`fnv1a32(target + ":" + prevSeed + ":arrival")`) | Phase 6 | Repeat visits still re-roll (Oolite-like), reload never does |
| Probe has flight/dock/station/economy/save groups | Adds `chart` and `hyperspace` groups | Phase 6 | Chart/countdown/arrival/reload provable without screenshots |

**Deprecated/outdated in this phase's scope:**
- The Phase 4/5 statement "the save records the post-launch clock (+600 s) and mode docked" (STATE.md "Plan 04-05") — superseded by D-17's pre-launch snapshot.
- `UNKNOWN_HYPERSPACE_SYSTEM = "(Unknown)"` in `src/ui/station-model.ts:300` — F5 must now show the committed target or `"(Unknown)"` only when none is committed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A hyperspace jump may only be **started from `inFlight`**; pressing H while docked is inert (Oolite only runs the countdown from `STATUS_IN_FLIGHT`). D-06 lists only target/range/fuel as gates, and D-01 explicitly allows the chart while docked, so this mode gate is inferred, not stated. | Pattern B / Open Question 1 | If the owner wants a jump straight off the pad, the countdown must tick in `docked` mode and the `launched` transition must not cancel it — a real change to `stepFlight`'s mode gating |
| A2 | The persisted `targetSystem` needs **no new HUD element**; "the HUD show the same target" (D-12) is satisfied by the countdown message line plus the chart's target marker, and F5's line is the durable readout. | Pattern C / Open Question 2 | Adding a 12th HUD element breaks the pinned eleven-element e2e assertion and changes the HUD layout contract |
| A3 | `MAX_SAVE_CHARS = 65_536` is a valid upper bound (≈38.9 KB worst case under the schema caps). | Schema skeleton | If the arithmetic is wrong a legitimate save is `unreadable` and the player loses progress |
| A4 | The chart is a **canvas** overlay, not SVG or DOM. | Alternatives Considered | If the team wants zero canvas code the chart must be rebuilt as DOM; the pure model still transfers |
| A5 | Arrival offset magnitude is uniform in `[760, 12_800] m` and the angle uniform in `[0, 2π)`, both from one FNV word, rather than Oolite's two-draw `Ranrot` distribution. | Deterministic arrival example | Distribution differs statistically (uniform vs Oolite's clamped-triangular-ish); no test can tell, but a fidelity reviewer may object |
| A6 | The market/docked-save "one seed, one encoding" rule (never both `marketSeed` and `market.seed`) is an acceptable reading of D-13's "preserving every v1 field". | Pitfall 9 | If the planner instead writes both, the validator must enforce equality or a hand-edited save becomes ambiguous |
| A7 | Autosave is *not* required to fire on F2 Load. D-22 does not say, and writing would rewrite the blob the player just loaded. | Open Question 4 | If the owner expects a load to re-anchor, the introduced clock could be written back |
| A8 | `stationAngle`, `launchCount`, `dockCount`, `bounceCount`, `flightTime` are **not** persisted; a reload resets them. | Pitfall 7 | Cosmetically the station's visible rotation phase jumps on reload; no requirement covers it |

**If this table is empty:** it is not — eight items need confirmation at plan time, four of them (A1, A2, A6, A7) change behaviour rather than only presentation.

## Open Questions (RESOLVED)

All five are decided in the phase plans; the chosen contract is recorded beside each question.

1. **Can the player start a jump while docked?**
   - What we know: Oolite starts the countdown only from `STATUS_IN_FLIGHT` (`PlayerEntityControls.m:1517-1535`), and D-06's gates never mention mode. D-01/D-02 let the chart open while docked so a route can be planned before launch.
   - What's unclear: whether committing a target and pressing H on the pad should launch-and-jump or be inert.
   - **RESOLVED:** inert while docked. Plan 06-01 Task 2 gates `beginHyperspace` on `modeAtStart === "inFlight"` and emits no event otherwise; plan 06-04 records it as assumption A1 and every browser sequence launches before pressing H.

2. **Does D-12 require a HUD element for the hyperspace target?**
   - What we know: the HUD set is exactly eleven elements and an e2e test asserts set equality (`tests/e2e/hud.spec.ts:109`). F5 already has a "Hyperspace System" line (`station-model.ts:334`).
   - What's unclear: "the HUD show the same target after reload" could mean the message line or a new element.
   - **RESOLVED:** no new element. `HUD_ELEMENTS`/`HUD_LAYOUT` stay unchanged and the committed target is drawn as a second text line inside the existing clock element (plan 06-04 Task 3, assumption A2), with `probe.hud.hyperspaceTarget` and the chart marker as the machine-readable proof.

3. **Short-range zoom factor and whether short range scrolls.**
   - What we know: D-02 says no free pan; D-04 says the window must contain the 7 LY neighbourhood. The measured requirement is ±18 distance units; ±20 is safe.
   - **RESOLVED:** fixed ±20 distance units (implemented as chart-x ±40 and chart-y ±80, because two chart-y units span one distance unit), no scrolling and no zoom keys (plan 06-03 Tasks 1-2). Oolite's zoom/scroll is not ported this phase.

4. **Should an in-session F2 Load re-write the save?**
   - What we know: D-22 says load, restore and resume; D-23 says the probe reflects the committed revision and clock after a *save*.
   - **RESOLVED:** Load does not write. The loaded blob already exists; plan 06-05 Task 3 installs the restored state and never calls `autosave()`/`store.write`, so any clock normalisation is not persisted back over the original (assumption A7).

5. **What should happen when the player changes the target while a countdown is running?**
   - What we know: the sim snapshots the target at countdown start; Oolite would jump to the newly selected target because it re-reads `nextHopTargetSystemID` at commit.
   - **RESOLVED:** committing a new target cancels the countdown. Plan 06-01 Task 2 clears the countdown and emits `hyperspaceCountdownCancelled` when `options.hyperspace.target.id` differs from the snapshot, and the app puts the cancellation copy on the message line (D-11/D-25).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + Compose | every command (AGENTS.md) | ✓ (project baseline) | — | none — this is the definition of done |
| Node 24 in the `ci` image | `vite`, `vitest`, `playwright`, `tsc` | ✓ (`package.json` `engines.node ^24`) | 24.x | — |
| Chromium (baked into the image) | chart/countdown/reload browser proofs | ✓ | Playwright 1.64.1 image | — |
| Oolite checkout `/home/opencode/git/oolite` | behaviour reference during implementation | ✓ (read this session) | pinned snapshot | vendored `third_party/oolite/` for data only |
| `src/content/generated/systems/g0.json` | chart graph, distances, resolution by id | ✓ | 256 records | — |
| Network access | none needed | ✗ by design | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none. This phase adds no tool, service or package.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`, so this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (Node environment, one `unit` project) + Playwright 1.64.1 |
| Config file | `vitest.config.ts` (includes `src/**/*.test.ts`, `tests/**/*.test.ts`, `tools/**/*.test.ts`); `playwright.config.ts` (`testDir ./tests/e2e`, `workers: 2`, `baseURL 127.0.0.1:4173`, `webServer: vite preview`) |
| Quick run command | `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts tests/ui/chart-model.test.ts tests/persistence/save-v2.test.ts` |
| Full suite command | `docker compose run --rm verify` (lint → typecheck → assets:check → test → build → test:e2e) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| WORLD-06 | `chartDistance` / `fuelCost` / `jumpTimeSeconds` fixtures | unit | `npx vitest run tests/sim/hyperspace.test.ts` | ❌ Wave 0 |
| WORLD-06 | `Math.trunc` vs `Math.floor` discrimination (`Legees→Laeden`, 875 edges) | unit | same file | ❌ Wave 0 |
| NAV-01 | 256 markers, 875 edges, both projections, short-range window covers the neighbourhood | unit | `npx vitest run tests/ui/chart-model.test.ts` | ❌ Wave 0 |
| NAV-01 | Chart opens on F6 both modes, plots, closes; F6 inert while launching | e2e | `npx playwright test tests/e2e/hyperspace.spec.ts` | ❌ Wave 0 |
| NAV-02 | Selection (click + arrow), distance/cost readout, unreachable marked and refused | unit + e2e | chart-model unit + hyperspace spec | ❌ Wave 0 |
| NAV-03 | Fuel ≥ cost gate, 70-unit tank, `dist ≤ 17` range gate | unit | `tests/sim/hyperspace.test.ts` | ❌ Wave 0 |
| NAV-04 | Exactly 1800 steps = 15.0 s; abort is free; clock delta exact | unit | `tests/sim/hyperspace.test.ts` (`stepFlight` loop) | ❌ Wave 0 |
| NAV-05 | Arrival pose deterministic per route; scene/market swapped | unit + e2e | `tests/sim/hyperspace-arrival.test.ts` + e2e | ❌ Wave 0 |
| NAV-06 | `fuel - cost` integer for every dist 0..17; never negative | unit | `tests/sim/hyperspace.test.ts` | ❌ Wave 0 |
| SAVE-01 | v2 accept table, migration, future/corrupt/unreadable classification | unit | `npx vitest run tests/persistence/save-v2.test.ts` | ❌ Wave 0 (extend `tests/persistence/save.test.ts`) |
| SAVE-02 | Round-trip credits/cargo/fuel/equipment/system/clock/seed/market | unit | `tests/persistence/autosave.test.ts` | ✅ extend |
| SAVE-03 | In-flight restore applies pose/mode/speed/rates/torus/clock exactly | unit | `tests/persistence/autosave.test.ts` | ✅ extend |
| SAVE-04 | Corrupt/future leave bytes untouched; oversized bounded; previous blob preserved | unit + e2e | `tests/persistence/save-v2.test.ts`, `tests/e2e/autosave.spec.ts` | ✅ extend (future → v3) |
| SAVE-05 | F2 Save/Load docked-only; overwrite confirm; autosave on launch and arrival | e2e | `npx playwright test tests/e2e/save-load.spec.ts` | ❌ Wave 0 |
| SAVE-06 | Reload reproduces every market price and stock | e2e | `tests/e2e/hyperspace.spec.ts` (reload case) | ❌ Wave 0 |
| FLGT/ECON regression | Existing 44 plans stay green | full | `docker compose run --rm verify` | ✅ |

### Sampling Rate

- **Per task commit:** the narrowest unit file touched, e.g. `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts`.
- **Per wave merge:** `docker compose run --rm test` (whole Vitest suite) plus `docker compose run --rm typecheck`.
- **Phase gate:** `docker compose run --rm verify` must be green end-to-end before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/sim/hyperspace.test.ts` — WORLD-06, NAV-03, NAV-04, NAV-06 fixtures and the trunc/floor discriminators.
- [ ] `tests/sim/hyperspace-arrival.test.ts` — NAV-05 pose determinism, clamping, "no `Math.random`" (call twice, deep-equal; and a source scan).
- [ ] `tests/ui/chart-model.test.ts` — NAV-01/NAV-02 graph, projections, selection, hit test.
- [ ] `tests/persistence/save-v2.test.ts` — SAVE-01/SAVE-04 v2 accept/reject table and `migrateV1ToV2`.
- [ ] `tests/e2e/hyperspace.spec.ts` — NAV-01..06 end-to-end plus the reload-after-arrival proof.
- [ ] `tests/e2e/save-load.spec.ts` — SAVE-05 F2 screen, overwrite confirmation, failed-load isolation.
- [ ] Extend `tests/persistence/save.test.ts` / `autosave.test.ts` for v2 (the v1 cases become migration fixtures).
- [ ] Move `tests/e2e/autosave.spec.ts:479` and `:684` from `version: 2` to `version: 3`.
- [ ] No framework install needed (`vitest`, `@playwright/test` already present).

**Browser-proof notes (SwiftShader).** Every wait must be a probe wait with a generous timeout — the loaded in-flight frame is ~369 ms (STATE.md G-03-3). The countdown is 15 *simulated* seconds, so at 2.7 fps it takes 15 / (1/120) × 369 ms ≈ 4.6 s of wall time in the best case; with `MAX_STEPS_PER_FRAME = 5` (`src/sim/step.ts:11`, re-exported by `src/sim/time.ts`) the loop cannot catch up faster than 5/120 s per rendered frame, so 1800 steps need **360 rendered frames** ≈ 133 s under SwiftShader. Plan the countdown e2e with a `test.setTimeout(240_000)` (the existing `autosave.spec.ts` precedent) and wait on `probe.mode`/`probe.hyperspace.lastJump`, never a fixed sleep. If that is too slow, expose a `?test=1` seam that sets `hyperspaceCountdown` to a small value — but that taints the profile and must not be the only proof.

## Security Domain

`security_enforcement` is enabled (`security_asvs_level: 1`, `security_block_on: high`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No accounts; single local player |
| V3 Session Management | no | No sessions or cookies |
| V4 Access Control | no | No multi-user surface |
| V5 Input Validation | **yes** | zod strict schema + `validateSaveSemantics` + allow-lists for system/station/equipment/commodity; bounds on every numeric field; `MaxSaveChars` before `JSON.parse` |
| V6 Cryptography | no | No crypto; `fnv1a32` is an integrity checksum, explicitly not a security control (`src/sim/hash.ts:4-10`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered IndexedDB blob grants credits/cargo/equipment | Tampering / Elevation | Strict schema + allow-lists + semantic validator; the save is *not* a security boundary for cheating (single-player) but must never crash, execute code, or reach `findShip` with a forged key |
| Oversized blob exhausts memory before validation | Denial of service | `MAX_SAVE_CHARS` checked **before** `JSON.parse`, with a 256-char version sniff so a future blob is still classified (`save.ts:189-231`) |
| `__proto__` / prototype pollution through JSON keys | Tampering | `z.strictObject` + `Object.create(null)` binding/cargo maps; existing `__proto__` test (`save.spec.ts:220`) |
| Unknown-shape blob cleared and the player's only save lost | Data loss | Only a *provably this-build* v1/v2-shaped blob is `corrupt`; everything else is `unreadable` and untouchable (`save.ts:248-257`), and `canClear`/`canOverwrite` gate the session |
| Hand-edited pose with `1e308`/`NaN` crashes the renderer | Denial of service / Tampering | Finite + magnitude bounds in the schema; `sanitizeFlightState` repairs as defence in depth |
| A future build's save silently destroyed by an older build | Data loss | `version > SAVE_VERSION` → `future-version`, never cleared, never overwritten (proven by e2e today) |
| `innerHTML` with a system name from content | Cross-site scripting | `textContent` only in every new overlay, matching `src/ui/station.ts` |
| Enter/click on a forged chart row bypasses the action layer | Tampering | Non-focusable chart rows/labels; selection state lives in the model, not in DOM focus |

## Sources

### Primary (HIGH confidence)

- `/home/opencode/git/oolite/src/Core/legacy_random.h:154-174` — `distanceBetweenPlanetPositions` (integer `dx`, `(y1-y2)/2`, `trunc(sqrt)`), `accurateDistanceBetweenPlanetPositions`, `travelTimeBetweenPlanetPositions` (= distance²).
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:6544-6629` — `witchJumpChecklist` (mass blocker, same-system, `hyperspaceJumpDistance > maxHyperspaceDistance`, `hasSufficientFuelForJump`).
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:6630-6638` — `fuelRequiredForJump` = `10.0 * MAX(0.1, hyperspaceJumpDistance)`; `hasSufficientFuelForJump` = `fuel >= cost`.
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:6808-6811` — `fuel -= [self fuelRequiredForJump]` at the point of no return.
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:6873-6888` — `ship_clock_adjust += distance * distance * 3600.0`.
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:6913-6969` — `leaveWitchspace` arrival offset, `safeWitchspaceExitDistance` clamp, `getWitchspaceExitRotation`, `flightSpeed = fmin(maxFlightSpeed, 50.0f)`, zero pitch/roll.
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.m:3425-3452` — `performWitchspaceCountdownUpdates` (`fdim`, zero triggers the jump).
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntityControls.m:819-852`, `:1517-1535` — `beginWitchspaceCountdown`, cancel-on-second-press, checklist at start.
- `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.h:72`, `:109` — `DEFAULT_HYPERSPACE_SPIN_TIME 15.0f`, `MAX_JUMP_RANGE 7.0`.
- `/home/opencode/git/oolite/src/Core/Entities/PlayerEntity.h:282` — `PLAYER_MAX_FUEL 70`; `:94-106` — chart zoom/scroll/label constants; `:1574-1600`, `:1729-1754`, `:1913-1962` in `GuiDisplayGen.m` — projection (`vscale` `/2`), fuel oval, label gating.
- `/home/opencode/git/oolite/src/Core/OOTypes.h:158` — `typedef uint16_t OOFuelQuantity` (the implicit truncation that keeps fuel integral).
- `/home/opencode/git/oolite/src/Core/Universe.m:7173-7191` — `setSystemTo:` destroys and regenerates `commodityMarket`.
- `/home/opencode/git/oolite/src/Core/Universe.m:8771-8791` — `getWitchspaceExitPosition` = origin; `getWitchspaceExitRotation` = near identity with `(rnd-128)/1024` tilt.
- `/home/opencode/git/oolite/src/Core/Universe.h:162` — `MIN_DISTANCE_TO_BUOY 750.0f`.
- `/home/opencode/git/oolite/src/Core/Entities/Entity.h` — `SCANNER_MAX_RANGE 25600.0` (matches `layout.ts` `SCANNER_RANGE = 25_600`).
- Repo source read this session: `src/sim/flight/state.ts:18-153`, `src/sim/flight/step.ts:36-177`, `src/sim/flight/sanitize.ts:38-103`, `src/sim/flight/launch.ts:30-72`, `src/sim/commands.ts:13-25`, `src/sim/events.ts:24-40`, `src/sim/economy/market.ts:24-166`, `src/sim/player/profile.ts:34-62`, `src/sim/world/layout.ts:122-201`, `src/persistence/save.ts:44-417`, `src/persistence/autosave.ts:53-192`, `src/persistence/store.ts:18-52`, `src/app/game-session.ts:898-963, 1212-1306, 1524-1612, 1703-1733, 1845-1874`, `src/app/scene-manager.ts:126-139`, `src/app/probe.ts:200-251`, `src/input/actions.ts:44, 180-230`, `src/input/keyboard.ts:40-46, 174-196`, `src/main.ts:109-189, 227-246`, `index.html:487-571`, `src/ui/station.ts:1-369`, `src/ui/station-model.ts:300-350`.
- Content measured this session: `src/content/generated/systems/g0.json` (256 records, extents, 875 edges at `dist ≤ 17`, the single zero-distance pair), `src/content/generated/commodities.json` (17 commodities, 16 tradeable).

### Secondary (MEDIUM confidence)

- `.planning/research/FEATURES.md` §E — the five route fixtures, the 7 LY graph rule, countdown/arrival narrative (all re-verified against the checkout and the compiled data above).
- `.planning/PROJECT.md` Key Decisions — the stable-market modernisation, the flat-save decision, the Diesel/SwiftShader acceptance.

### Tertiary (LOW confidence)

- None. No external web source was used: every configured search provider is disabled in `.planning/config.json` (`exa_search`, `brave_search`, `firecrawl`, `tavily_search` all `false`) and no Context7 provider is available in this environment. The authoritative sources for this phase are the pinned Oolite checkout and the repository itself, so no claim in this document depends on a web search.

## Metadata

**Confidence breakdown:**
- **Standard stack: HIGH** — no package is added; every version read from `package.json` this session.
- **Hyperspace/Oolite behaviour: HIGH** — every formula, constant and arrival step quoted from the pinned checkout with line ranges.
- **Existing seams (save pipeline, scene swap, input contexts, probe): HIGH** — each was opened and quoted this session.
- **Save v2 shape: MEDIUM** — the semantic content is locked by D-13..D-16, but key names, the single-seed encoding (A6) and the pose bounds are new design.
- **Chart rendering: MEDIUM** — the 2:1 projection is derived from Oolite's `vscale` and the measured extents, but canvas-vs-SVG and label collision handling are our choice (A4, Pitfall 11).
- **Arrival hash: MEDIUM** — deterministic and clamped as D-08 requires, but the exact distribution is our design (A5).

**Research date:** 2026-11-06
**Valid until:** 2026-12-06 for the Oolite facts (pinned checkout — effectively stable indefinitely); 30 days for the repo seams (the tree moves every phase). Re-verify `tests/e2e/autosave.spec.ts` line numbers and `MAX_SAVE_CHARS` before planning if the tree has advanced.

