# Phase 8: Session Split and World Core - Context

**Gathered:** 2026-11-11
**Status:** Ready for planning

<domain>
## Phase Boundary

The game plays exactly as in v1, but it runs on new foundations:

- `src/app/game-session.ts` (3,365 lines) is split into subsystems under `src/app/session/`.
- A multi-entity world model exists in `src/sim/`: stable never-reused ids, id-order iteration, serialisable seeded random streams forked per entity and purpose, a world hash, and a snapshot/restore codec for tests.
- A typed seam for AI exists: read-only `WorldView` and write-only `ShipControl`.
- Tests can step the simulation by N ticks through the `?test=1` hook. NPC traffic is off by default in browser tests and specs opt in.

Requirements: FOUND-10, FOUND-11, FOUND-12, FOUND-13, FOUND-14.

Out of scope (later phases): any NPC in play (Phase 12+), the populator (Phases 12 and 22), save schema v3 and persisting `epoch` (Phase 11, SAVE-07), collision (Phases 10, 13 and 15), chart-in-flight simulation (Phase 12), scenario spawning for combat specs (Phase 13+).

</domain>

<decisions>
## Implementation Decisions

### Baseline
- **D-01:** The baseline for the split is a green **local** `docker compose run --rm verify-full`. The intermittent GitHub CI timeout of `tests/e2e/docking.spec.ts:594` (Shift+C beyond the aegis) is ignored for this phase and does not block it. The owner judges it a slow-runner timeout: the test passes locally. Do not add a plan to investigate it.

### World seed policy (D1, settled)
- **D-02:** `worldSeed = mix32(marketSeed, epoch)`. `epoch` is a counter incremented at every populate (launch and hyperspace arrival). Reloading a save and launching reproduces the same world; each later launch gives a different one. This is consistent with the existing "stable market across reload" decision and with D2 (NPCs not saved). — **Reversibility:** one-way — once Phase 11 writes `epoch` into save schema v3 and goldens pin worlds derived from it, changing the derivation re-rolls every saved world and needs a save migration.
- **D-03:** In Phase 8, `epoch` is held in session memory only (it starts at 0 and is not persisted). Phase 11 (SAVE-07) adds it to the save. Phase 8 delivers the derivation function, the counter and the bump points (launch, arrival).
- **D-04:** Per-entity streams are forked from `(worldSeed, entityId, purpose)` (PITFALLS 2), so spawning or killing one entity never shifts another entity's draws. Stream state is a plain serialisable integer, not a closure.
- **D-05:** `epoch` and the entity-id counter advance identically whether traffic is on or off, so the seed and the ids never depend on the test traffic flag.

### Fixed entity id table
- **D-06:** Fixed ids: `0` = `NO_ENTITY`; `1` planet; `2` sun; `3` main station; `4` witchpoint buoy; `5` station navigation buoy; `6..99` reserved for future static bodies; `100` player (Oolite's player UID); dynamic entities (NPCs, pods, missiles, wreckage) from `101`, monotonic and never reused. This supersedes ARCHITECTURE.md §5.1's draft `PLAYER_ID = 1`. — **Reversibility:** costly — ids appear in world hashes, golden fixtures and every AI/test reference; renumbering regenerates goldens.
- **D-07:** Both buoys are world entities with fixed ids, visible through `WorldView` (and later to the scanner, collision and AI "nearest buoy" queries). Static bodies are not duplicated: their entities reference `SystemLayout` data, which stays the single authority (PITFALLS 17). Aegis and the compass keep reading the layout.
- **D-08:** With no NPC present, the world hash equals the v1 flight hash (success criterion 2). Static bodies are derived from the layout and must not change that hash.

### Test hook and traffic opt-in
- **D-09:** A manual-clock URL mode, `?test=1&clock=manual`. The frame loop keeps rendering but never steps the simulation on its own. Only `advanceTicks(n)` steps it, synchronously and by exactly `n` ticks. Under this mode a browser spec and a Vitest run of the same N ticks produce the same hash (success criterion 5). Without the flag the loop behaves exactly as in v1.
- **D-10:** Traffic opt-in is a URL flag read once at boot: `?test=1&traffic=1`, following the same "read once" rule as `?test=1`. Under the test hook without the flag the populator does nothing. Production (no `?test=1`) always has traffic once it exists. No runtime toggle method is added to the hook. Precise combat scenarios in later phases use a separate, narrow scenario-spawn tool owned by those phases, not this flag (keeps the hook from becoming a god object, PITFALLS 27).

### Scripted test pilot
- **D-11:** The scripted test pilot is a real AI module under `src/sim/ai/` (for example `src/sim/ai/pilots/test-pilot.ts`). It reads only `WorldView` and acts only through `ShipControl`, and its state survives a JSON round trip with integer-tick timers. Living in the AI lint zone, it proves on real code that the zone rejects imports of simulation internals. Phase 13 reuses it as the shooter for the shared hit rule. The populator never spawns it.

### Split rollout
- **D-12:** Follow the 10-step extraction order of ARCHITECTURE.md §4.2. Step 0 re-points `tests/app/redraw-gate.test.ts` and `tests/guards/economy-purity.test.ts` at a concatenating source helper. The steps after it are, in order: `context`, `probe-publisher`, `render-driver`, `chart`/`settings`, `station`, `save`, `hyperspace` (moved as one atomic unit), `event-router` + `sim-driver`, then `frame-loop` + `start-session`. Each step is one commit with `verify` green. `verify-full` runs at steps 3, 6 and 9. `createGameSession` stays the only public export.
- **D-13:** The probe shape is frozen during the split. A snapshot test pins the exact `window.__wegolite` shape before step 1, and no probe field is added, renamed or removed until the split is complete. New fields (for example `tick` and `worldHash`) are added afterwards in one deliberate commit that updates the snapshot.
- **D-14:** The world core runs **in parallel** with the split, with strict file ownership. The core track owns `src/sim/world/**`, the new serialisable RNG, `hashWorld`, the snapshot codec, `WorldView`/`ShipControl`, `src/sim/ai/**`, and also the shared touchpoints `src/sim/math.ts`, `src/sim/events.ts` and `eslint.config.js`. The split track owns `src/app/session/**` and `src/app/game-session.ts` and does not edit the core track's files. The core is built and proven in Vitest first. It is plugged into the game at one point (`sim-driver`) by a single integration plan after split step 8.

### Claude's Discretion
- How `createSeededRandom` callers in `src/sim` (`src/sim/hyperspace/arrival.ts`) move to the serialisable RNG. The draw sequence must stay identical so that v1 arrival goldens do not regenerate. Render-side callers (`src/render/bodies/{nebulae,dust,starfield}.ts`) may keep the closure API.
- The exact `hashWorld` line format, provided that D-08 holds.
- `EntityStore` internals, following ARCHITECTURE.md §5: dense id-ordered array, `kill` then `commit`, snapshot-length iteration, `MAX_ENTITIES = 256`.
- The lint-rule shape for banning `Math.random`, `Date`, wall-clock reads, `for..in` and bare `.sort()` in `src/sim`, and the AI-zone import ban (extend `eslint.config.js` and the `tests/guards/` probes).
- Reserving the audio event types (missile, ECM, scoop and the rest of ARCHITECTURE.md §7.6) in `src/sim/events.ts`.
- The internal name and shape of `advanceTicks` on the hook, provided it is gated by `?test=1&clock=manual`.
- The changelog: Phase 8 is internal-only unless a user-visible change appears.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` § "Phase 8: Session Split and World Core": goal, the 5 success criteria, pitfalls list, decisions to settle
- `.planning/REQUIREMENTS.md`: FOUND-10..FOUND-14; SAVE-07 and SAVE-08 for the later epoch persistence
- `.planning/PROJECT.md` § Key Decisions: D2 (NPCs not saved), stable market across reload, determinism and golden fixtures, redraw gate, `?test=1` taint rules

### Architecture and pitfalls
- `.planning/research/ARCHITECTURE.md` §4 (split module table, extraction order, test impact and hazards), §5 (ids, store, iteration, player as hybrid; note that D-06 overrides §5.1's player id), §7.2–7.4 (AI data, `WorldView`/`ShipControl`, event queue), §7.6 (presentation events), §8.2/§8.4 (world lifecycle, snapshot codec), §14 (patterns)
- `.planning/research/PITFALLS.md`: pitfalls 1, 2, 3, 4, 7, 8, 9, 10, 11, 13, 17, 19, 27 (named in the roadmap)
- `.planning/research/SUMMARY.md` § "Open Decisions for the Owner" and § "Owner decisions recorded at milestone start"
- `.planning/research/STACK.md` § "Decision 1: Entity store" (hand-rolled, no ECS library)

### Oolite reference
- `/home/opencode/git/oolite/src/Core/Universe.m`: entity UID allocation (around 5004-5029) and update order (around 6432-6540); player UID 100 (around 4843)
- `/home/opencode/git/oolite/src/Core/Entities/ShipEntity.m`: attitude and thrust integration that NPC motion will port later

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sim/hash.ts`: `fnv1a32`, `canon`, the hashing primitives for `hashWorld`.
- `src/sim/flight/state.ts`: `hashFlight(state)`, the v1 flight hash that the empty-world hash must equal (D-08).
- `src/sim/math.ts`: `createSeededRandom(seed)` returns a closure (not serialisable); the new RNG state must reproduce its sequence.
- `src/sim/step.ts` / `src/sim/time.ts`: `DT = 1/120`, `MAX_STEPS_PER_FRAME`, `MAX_FRAME_DELTA`, the single tick contract.
- `src/sim/loop.ts`: `runToSteps`, `clampFrameDelta`; `advanceTicks` and manual-clock mode plug in here or in `sim-driver`.
- `src/sim/world/layout.ts`, `src/sim/world/aegis.ts`: `SystemLayout`, the authority for static bodies (D-07).
- `src/app/probe.ts`: the `window.__wegolite` probe; shape frozen during the split (D-13).
- `tests/guards/eslint-gate.ts`, `tests/guards/sim-purity.test.ts`: the shared ESLint Node API instance and the existing purity guard to extend with the new bans.

### Established Patterns
- `src/sim` is pure TypeScript: no Three.js and no DOM, enforced by `eslint.config.js` (`no-restricted-imports`/`-globals`/`-properties`/`-syntax`) and the guard tests.
- Determinism uses fixed 1/120 s steps, cadence-independent hashes and checked-in golden fixtures; goldens must not be regenerated in this phase.
- `?test=1` is read once at boot. Every hook mutation taints the profile, and the autosave skips a tainted profile.
- The redraw gate (`src/app/redraw-gate.ts`): five `redrawGate.request()` calls and one gated `renderFrame` must survive the split. The test-scan helper of step 0 makes this location-independent.

### Integration Points
- `src/app/game-session.ts`: the monolith being split. `frame()` (around 2763-2855) becomes `sim-driver`, which is the single plug-in point for `stepSim` and the world.
- `src/sim/hyperspace/arrival.ts`: the only sim-side `createSeededRandom` user (arrival pose draw at jump commit).
- `src/sim/events.ts`: the sim-to-presentation event types; audio types reserved here.
- `eslint.config.js`: new bans (`Math.random`, `Date`, wall clock, `for..in`, bare `.sort()`) and the `src/sim/ai/**` import zone.
- `tests/app/redraw-gate.test.ts`, `tests/guards/economy-purity.test.ts`: read the session file as text; re-pointed at step 0.

</code_context>

<specifics>
## Specific Ideas

- The owner wants the test-only switches to stay narrow: URL flags read at boot, no runtime toggles. Later combat specs get their own scenario-spawn tool, not a broader traffic switch.
- The owner prefers small, bisectable commits for the split (research order) and parallel progress on the pure-sim core.

</specifics>

<deferred>
## Deferred Ideas

- A scenario-spawn test tool (place a named ship at a pose) for combat and law specs, owned by Phase 13 or the first phase that needs it.
- Persisting `epoch` and `nextEntityId` in the save: Phase 11 (SAVE-07, SAVE-08 stage 1).

### Reviewed Todos (not folded)
- `2026-11-11-check-ci-after-0-2-0-and-the-shift-c-docking-timeout.md`: the owner chose to ignore it for Phase 8 (local `verify-full` is the baseline; the GitHub failure is judged a slow-runner timeout). The todo file is left untouched.
- `2026-11-10-keep-simulating-behind-the-chart.md`, `2026-11-10-decide-behaviour-below-24-fps.md`, `2026-11-10-fix-torus-refusal-message-under-mass-lock.md`: tagged for Phase 12.
- `2026-11-10-add-planet-and-sun-collision.md`: tagged for Phase 15.
- `2026-11-11-cargo-purchase-cost-basis-tracking.md`, `2026-11-11-terminal-color-palette-setting.md`: unrelated to the world core; not in this phase.

</deferred>

---

*Phase: 08-session-split-and-world-core*
*Context gathered: 2026-11-11*
