# Phase 8: Session Split and World Core - Research

**Researched:** 2026-11-11
**Domain:** Behaviour-preserving refactor of a 3,365-line TypeScript closure, plus a pure-TypeScript deterministic multi-entity world core (ids, store, seeded streams, hash, snapshot codec, AI seam), ESLint zone enforcement, and a Playwright tick-stepping test hook
**Confidence:** HIGH (nearly everything is first-party code and planning artefacts read this session; two ESLint behaviours were proven by a container experiment)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Baseline**
- **D-01:** The baseline for the split is a green **local** `docker compose run --rm verify-full`. The intermittent GitHub CI timeout of `tests/e2e/docking.spec.ts:594` (Shift+C beyond the aegis) is ignored for this phase and does not block it. The owner judges it a slow-runner timeout: the test passes locally. Do not add a plan to investigate it.

**World seed policy (D1, settled)**
- **D-02:** `worldSeed = mix32(marketSeed, epoch)`. `epoch` is a counter incremented at every populate (launch and hyperspace arrival). Reloading a save and launching reproduces the same world; each later launch gives a different one. This is consistent with the existing "stable market across reload" decision and with D2 (NPCs not saved). — **Reversibility:** one-way — once Phase 11 writes `epoch` into save schema v3 and goldens pin worlds derived from it, changing the derivation re-rolls every saved world and needs a save migration.
- **D-03:** In Phase 8, `epoch` is held in session memory only (it starts at 0 and is not persisted). Phase 11 (SAVE-07) adds it to the save. Phase 8 delivers the derivation function, the counter and the bump points (launch, arrival).
- **D-04:** Per-entity streams are forked from `(worldSeed, entityId, purpose)` (PITFALLS 2), so spawning or killing one entity never shifts another entity's draws. Stream state is a plain serialisable integer, not a closure.
- **D-05:** `epoch` and the entity-id counter advance identically whether traffic is on or off, so the seed and the ids never depend on the test traffic flag.

**Fixed entity id table**
- **D-06:** Fixed ids: `0` = `NO_ENTITY`; `1` planet; `2` sun; `3` main station; `4` witchpoint buoy; `5` station navigation buoy; `6..99` reserved for future static bodies; `100` player (Oolite's player UID); dynamic entities (NPCs, pods, missiles, wreckage) from `101`, monotonic and never reused. This supersedes ARCHITECTURE.md §5.1's draft `PLAYER_ID = 1`. — **Reversibility:** costly — ids appear in world hashes, golden fixtures and every AI/test reference; renumbering regenerates goldens.
- **D-07:** Both buoys are world entities with fixed ids, visible through `WorldView` (and later to the scanner, collision and AI "nearest buoy" queries). Static bodies are not duplicated: their entities reference `SystemLayout` data, which stays the single authority (PITFALLS 17). Aegis and the compass keep reading the layout.
- **D-08:** With no NPC present, the world hash equals the v1 flight hash (success criterion 2). Static bodies are derived from the layout and must not change that hash.

**Test hook and traffic opt-in**
- **D-09:** A manual-clock URL mode, `?test=1&clock=manual`. The frame loop keeps rendering but never steps the simulation on its own. Only `advanceTicks(n)` steps it, synchronously and by exactly `n` ticks. Under this mode a browser spec and a Vitest run of the same N ticks produce the same hash (success criterion 5). Without the flag the loop behaves exactly as in v1.
- **D-10:** Traffic opt-in is a URL flag read once at boot: `?test=1&traffic=1`, following the same "read once" rule as `?test=1`. Under the test hook without the flag the populator does nothing. Production (no `?test=1`) always has traffic once it exists. No runtime toggle method is added to the hook. Precise combat scenarios in later phases use a separate, narrow scenario-spawn tool owned by those phases, not this flag (keeps the hook from becoming a god object, PITFALLS 27).

**Scripted test pilot**
- **D-11:** The scripted test pilot is a real AI module under `src/sim/ai/` (for example `src/sim/ai/pilots/test-pilot.ts`). It reads only `WorldView` and acts only through `ShipControl`, and its state survives a JSON round trip with integer-tick timers. Living in the AI lint zone, it proves on real code that the zone rejects imports of simulation internals. Phase 13 reuses it as the shooter for the shared hit rule. The populator never spawns it.

**Split rollout**
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

### Deferred Ideas (OUT OF SCOPE)
- A scenario-spawn test tool (place a named ship at a pose) for combat and law specs, owned by Phase 13 or the first phase that needs it.
- Persisting `epoch` and `nextEntityId` in the save: Phase 11 (SAVE-07, SAVE-08 stage 1).
- Out of scope for this phase (from the phase boundary): any NPC in play (Phase 12+), the populator (Phases 12 and 22), save schema v3 and persisting `epoch` (Phase 11, SAVE-07), collision (Phases 10, 13 and 15), chart-in-flight simulation (Phase 12), scenario spawning for combat specs (Phase 13+).
- Reviewed todos not folded: the Shift+C CI timeout todo (ignored for Phase 8), the three Phase 12 todos, the Phase 15 planet/sun collision todo, the cost-basis and palette todos.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-10 | Existing v1 play is unchanged after `src/app/game-session.ts` is split into subsystems: every v1 golden, unit and e2e test passes without regeneration, and the probe shape is unchanged | Split table and hazards (Architecture Patterns 1-3), source-scan test impact, probe-shape spec design, Pitfalls 1-5, 12 |
| FOUND-11 | The simulation holds many entities with stable, never-reused ids and canonical id-order iteration; with no NPCs present the world hash equals the v1 flight hash | Entity model and store (Pattern 4), hash composition (Pattern 5, Code Example 2), fixed-id table, Pitfalls 6-8 |
| FOUND-12 | All simulation randomness comes from serialisable seeded streams forked per entity and purpose; `src/sim` has no `Math.random`, `Date` or wall clock; live and restored worlds hash identically after 1,000 ticks | RNG (Pattern 6, Code Example 1), snapshot codec (Pattern 7), lint bans (Pattern 8, Code Example 3, container-verified) |
| FOUND-13 | AI code reads the world only through a typed `WorldView` and acts only through a typed `ShipControl`; AI state is plain serialisable data with integer tick timers | Seam types and AI zone (Pattern 9, Code Example 4), test pilot design |
| FOUND-14 | Tests can advance the simulation by N ticks through the test hook, and NPC traffic is off by default in browser tests and opt-in per spec | Manual clock and flags (Pattern 10), sim-driver seam, e2e spec design |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

`./CLAUDE.md` does not exist. `AGENTS.md` (project guide) is authoritative and carries the same weight as locked decisions. Directives that bind this phase:

- **Everything runs in Docker.** A green host run is not evidence. Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>`, `docker compose run --rm e2e sh -lc "npm run build && npx playwright test <spec>"`, `docker compose run --rm typecheck`, `lint`, `verify` (fast gate), `verify-full` (release gate; CI runs it).
- **`src/sim/` is pure TypeScript**: no Three.js, no DOM, fixed-timestep, deterministic, unit-testable. Rendering, input and UI are downstream through commands and events.
- **No database, no new server storage.** Saves stay in IndexedDB; Phase 8 does not touch the save schema.
- **Licensing/provenance:** no new asset is added in this phase (no `NOTICE`/`ASSETS.md` change expected).
- **No OXP support.**
- **Documentation language:** all `.planning/`, docs, commit messages and PR text in English.
- **Changelog:** user-visible changes go under `## [Unreleased]` in the same commit; internal-only changes (tests, refactors, build tooling) may be omitted.
- **Decisions:** record significant decisions in `.planning/PROJECT.md` under Key Decisions.
- **Scratch files** live under `/tmp` and are mounted into the container; never add scratch files to the repo.
- **GSD workflow:** file changes go through a GSD command; subagents get the reviewer/subagent brief block and the Oolite checkout path (`/home/opencode/git/oolite`).
- **Simple mechanical tasks** (status rows, renames, version bumps) are delegated to the cheapest model tier; design, simulation code, persistence and licensing stay on the main model.
- Project skills read: `principle-boundary-discipline` (validate at boundaries, trust internal types), `principle-test-behavior-not-implementation` (assert observable behaviour; derive expected values from the requirement, not from the code under test), `principle-type-system-discipline` (make illegal states unrepresentable, parse JSON at the boundary).

## Summary

Phase 8 is two independent tracks joined at one seam. The **split track** mechanically decomposes `src/app/game-session.ts` (3,365 lines, one closure) into `src/app/session/*` modules in ten bisectable commits, guarded by a new probe-shape snapshot and by re-pointing the two tests that read the session file as text. The **core track** builds, in pure `src/sim`, a dense id-ordered entity store with never-reused ids, a serialisable mulberry32 stream with forked seeds, a composed world hash that is byte-identical to `hashFlight` when no NPC has ever existed, a strict snapshot codec, the read-only `WorldView` / write-only `ShipControl` seam, a scripted test pilot under `src/sim/ai/`, and ESLint rules that enforce all of it. One integration plan after split step 8 plugs `stepSim` into `sim-driver`, adds the world lifecycle (create at launch/arrival/in-flight restore, drop at dock, bump `epoch`), the `?test=1&clock=manual` / `&traffic=1` flags, `advanceTicks`, and one deliberate probe addition.

The riskiest facts found in the code: (1) the two session-text scanning tests are order-sensitive (`toEqual` on an ordered two-element array of `renderFrame(` matches) and `switchCaseBody` picks the *first* `case "docked":` in the concatenation, so the step-0 helper must be written to be order-independent and the event-router file must be the only place with that `case`; (2) the existing `no-restricted-syntax` / `no-restricted-imports` configs are replaced, not merged, by a later config block that sets the same rule key (verified), so the AI-zone block must restate what it needs; (3) `tests/guards/sim-purity.test.ts` source-scans `src/sim` for any import specifier containing the substring `input` and for type names containing `Frame` — new sim files must avoid both; (4) the `?test=1` hook captures `FlightState` by identity (G-8), so `advanceTicks` and the world must read live session fields through the context, never capture them; (5) FIDELITY.md pins `src/sim/hyperspace/arrival.ts:125` and `src/sim/flight/step.ts:218`, so leave those files byte-identical by re-implementing `createSeededRandom` on top of the new RNG inside `math.ts` instead of editing `arrival.ts`.

No external package is needed: everything uses the existing toolchain (TypeScript 6.0.2, Vitest 5.0.5, fast-check 4.10.2, ESLint 10.14.0, typescript-eslint 8.72.1, Playwright 1.64.1). The Package Legitimacy Gate is therefore not triggered.

**Primary recommendation:** Pin the safety nets first (verify-full baseline, probe-shape spec, session-source helper, recorded v1 flight-hash pins), then run the split (A track) and the core (B track) in parallel under the D-14 file ownership, and join them in one integration plan that only touches `sim-driver`, the world lifecycle hooks, the hook/flags and one probe-snapshot update.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Entity ids, store, iteration order, hash, snapshot codec, RNG, AI seam types | `src/sim` (pure) | — | Determinism product; must run in Node with no DOM/Three (AGENTS.md constraint 3 of Conventions) |
| Static-body entities (ids 1-5) | `src/sim` view over `SystemLayout` | — | `SystemLayout` stays the single authority (D-07); not stored, not hashed (D-08) |
| Player as entity id 100 | `src/sim` adapter over `FlightState` | — | Storage stays `FlightState` (ARCH §5.4); uniform read interface only |
| Per-tick orchestration (`stepSim`) | `src/sim` | `src/app/session/sim-driver` calls it | `stepFlight` runs first, world after; the app only drives and routes events |
| World lifecycle (create at launch/arrival, drop at dock, bump `epoch`) | `src/app/session` (hyperspace, station-flow, sim-driver) | `src/sim` supplies `createWorld`/`worldSeed` | Lifecycle is session policy keyed on events; derivation is sim |
| Manual clock, `advanceTicks`, traffic flag | `src/app/session` (test-flags, sim-driver, probe hook) | — | URL flags are an app boundary; the sim never sees them |
| Lint bans and AI zone | `eslint.config.js` + `tests/guards/*` | — | Mechanical enforcement; proven by generated probes |
| Probe shape pin and tick-hook parity | Playwright (`tests/e2e`) | Vitest for the pure parts | Only a browser can read the real `window.__wegolite` |
| Session split bookkeeping tests | Vitest (`tests/app`, `tests/helpers`) | — | Source-scan tests read text, no browser |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.2 | Types for the world model, branded-free `EntityId` | Project toolchain [VERIFIED: package.json devDependencies] |
| Vitest | 5.0.5 | Unit/integration incl. world property tests | Project toolchain; `include` covers `src/**/*.test.ts`, `tests/**/*.test.ts` [VERIFIED: vitest.config.ts] |
| fast-check | 4.10.2 | Property tests for store invariants (ids monotonic, never reused, snapshot round trip) | Already a devDependency [VERIFIED: package.json] |
| ESLint + typescript-eslint | 10.14.0 / 8.72.1 | Zone enforcement via core rules `no-restricted-imports/-globals/-properties/-syntax` | Existing mechanism; no plugin needed (container experiment, Pattern 8) |
| Playwright | 1.64.1 | Probe-shape spec and tick-hook spec | Project e2e toolchain [VERIFIED: package.json, playwright.config.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/sim/hash.ts` (`fnv1a32`, `canon`) | in-repo | World hash text (not seed mixing: world and fork seeds use `mix32` per D-02, see Pattern 6) | All hashing; never `JSON.stringify` for hashed text |
| `tests/guards/eslint-gate.ts` (`lintProbe`) + `probe-lock.ts` (`withProbeLock`) | in-repo | Generated-probe lint proofs for the new bans | One guard test per ban and for the AI zone |
| `tests/helpers/lave.ts` (`laveFixture`) | in-repo | Real layout/config for world tests and Node-side expected hashes | Any test needing a `SystemLayout` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled store | bitecs / miniplex / koota | Rejected in STACK.md Decision 1: bitecs recycles ids, miniplex has no ids/serialisation, koota has no documented snapshot API [CITED: .planning/research/STACK.md:56-86] |
| `eslint-plugin-import` `no-restricted-paths` for the AI zone | core `no-restricted-imports` with `regex` allow-list | Plugin would add a dependency and a Docker rebuild; the core rule with a negative-lookahead regex was proven to work (Pattern 8) |
| Branded `EntityId` | plain `number` alias | ARCH §5.1 uses a plain alias; ids cross JSON and fixtures constantly. Recommend plain alias; the skill's "brand semantic primitives" is satisfied adequately by the named alias plus the `NO_ENTITY` constant (discretion) |

**Installation:** none. No `package.json` change is expected, so no `docker compose down --volumes` is needed for dependencies.

**Version verification:** versions read from `package.json` this session; the container reports Node `v24.22.2` [VERIFIED: `docker compose run --rm lint node --version`]. No registry query is needed because nothing new is installed.

## Package Legitimacy Audit

This phase installs no external packages. `package-legitimacy check` was therefore not run.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                           URL: ?test=1 [&clock=manual] [&traffic=1]   (read once at boot)
                                         |
                                 parseTestFlags()  (pure, Node-testable)
                                         |
  keyboard/UI ---> input.drainCommands() |        window.__wegolite  <--- probe-publisher (shape frozen until the
       |                 |               v                                  one deliberate post-split commit)
       |                 v        +--------------+                              ^
       |         frame-loop ----> | sim-driver   |----> stepOnce(commands) -----+  (probe.sim.tick/entities/epoch)
       |         (render always)  | realtime:    |        |
       |                          |  GameLoop.advance     |  1. stepFlight(player,...)     [unchanged]
       |                          | manual clock:         |  2. world live? stepWorld(world, player, ...)
       |                          |  advanceTicks(n) ---->|  3. events -> event-router (ordered subscribers)
       |                          +--------------+        v
       |                                                 SimEvent[] --> hudMessages, stationFlow, dockFeedback,
       |                                                                 hyperspaceFlow (lifecycle hooks), autosave
       v
  render-driver (single gated renderFrame call site; redrawGate.request x5)

  stepWorld (pure, src/sim):  W0 tick/commands -> W1 update (id order, length snapshot) -> W2 AI think
                              (id order; WorldView read, ShipControl write; queued events drained FIFO)
                              -> W5 commit (compact dead, rebuild id index)
  World = { store (dense array ascending id + id->index Map for lookup only), nextId, world rng, aiQueue }
  Static ids 1..5 and player id 100 are NOT stored: WorldView synthesises them from SystemLayout / FlightState.
  hashWorld(player, world?) = fnv1a32( serializeFlight(player) + section ), section = "" until anything ever spawned
```

### Recommended Project Structure
```
src/sim/
  rng.ts                  # RngState, rngNext, forkSeed, mix32 (new; core track)
  math.ts                 # createSeededRandom delegates to rng.ts (core track; same bit sequence)
  events.ts               # + reserved presentation/audio event types (core track)
  sim.ts                  # stepSim(player, world, ...) composes stepFlight + stepWorld (core track)
  world/
    ids.ts                # EntityId, NO_ENTITY, fixed ids, FIRST_DYNAMIC_ID, MAX_ENTITIES (no imports; AI-importable)
    entity.ts             # Entity, components, EntityKind, ScanClass, BehaviourId unions
    store.ts              # EntityStore (spawn, kill, commit, get, live)
    world.ts              # World, createWorld(layout, worldSeed), worldSeedFor(marketSeed, epoch)
    view.ts               # WorldView interface + ShipView (TYPES ONLY; AI-importable)
    control.ts            # ShipControl interface (TYPES ONLY; AI-importable)
    view-impl.ts          # createWorldView(world, player, layout) (imports internals)
    control-impl.ts       # createShipControl(world, actorId)
    serialize.ts          # serializeWorldSection, hashWorld
    snapshot.ts           # snapshotWorld, restoreWorld, parseWorldSnapshot (boundary validation)
    sanitize.ts           # sanitizeEntity (finite check, -0, renormalise, repair count)
    step.ts               # stepWorld
  ai/
    types.ts              # AiComponent, ParamValue, AiThink signature
    time.ts               # ticks(seconds) rounding in one place
    registry.ts           # AI_REGISTRY: aiKey -> think (world/step.ts imports this)
    pilots/test-pilot.ts  # D-11
src/app/session/          # split track: context, probe-publisher, render-driver, chart-controller,
                          # settings-controller, station-controller, save-controller, hyperspace-controller,
                          # event-router, sim-driver, frame-loop, start-session, test-flags
src/app/game-session.ts   # shrinks to the facade; createGameSession stays the only public export
tests/helpers/session-source.ts   # step 0 helper
tests/sim/world/, tests/sim/ai/, tests/guards/ (new bans + AI zone), tests/e2e/probe-shape.spec.ts, tests/e2e/tick-hook.spec.ts
```
Avoid file or specifier names containing the substring `input` anywhere in `src/sim` and avoid declaring type names containing `Frame` in `src/sim` or `src/app` (Pitfall 4).

### Pattern 1: The current session structure (what the split moves)
**What:** `createGameSession` is one closure from line 335 with about 100 `let` fields (356-487) and about 120 inner functions. Section line ranges in ARCHITECTURE §4.1 still match the file: `handleEvent` at 2294, `updateProbe` at 2412, `frame` at 2699, `startSession` at 2884, `performSwap` at 3265, `dispose` at 3303 [VERIFIED: rg of `^  function` lines in src/app/game-session.ts]. `createGameSession` returns `start, resize, pause, resume, isPaused, enterContextLoss, exitContextLoss, clearInput, focusLost, shown, dispose` [VERIFIED: src/app/game-session.ts:3348-3364].
**When to use:** follow ARCH §4.1 module table and §4.2 order exactly (D-12). Each step: one commit, `docker compose run --rm verify` green; `verify-full` at steps 3, 6, 9.
**Behaviour that must survive (read this session):**
- `frame()` order: `rafId = requestAnimationFrame(frame); probe.frames += 1;` then guard on undefined live fields; pause toggle; chart drain; save-screen drain; chart-open branch (drains, `redrawGate.request()`, `updateProbe()`, return); save-screen branch (same); station actions applied only when `!paused && mode === "docked"`; commands drained and the `launch` filter applied; **pre-launch `autosave()` while still docked**; `mapHyperspaceBeginEdges`; one `currentInput.frame()` per rendered frame shared by every step; `currentLoop.advance(delta, commands, stepCb)`; `renderFrame(alpha, shouldDraw())` [VERIFIED: src/app/game-session.ts:2699-2864].
- The step callback re-reads `state/layout/config` live for every step (a jump can swap them mid-frame), sets `previousPose = currentPose`, picks `scripted` controller when `mode === "launching"`, derives `equipmentSet()`, `targetSystem()`, `witchspaceStationMass(system.station)`, builds `StepOptions` with `dock: dockGeometry` when present, calls `stepFlight(...)`, runs `handleEvent` per event, advances `launchSequence` only when `modeBefore === "launching"`, then `currentPose = poseOf(liveState)` [VERIFIED: src/app/game-session.ts:2795-2854].
- `handleHyperspaceJumped` is called from inside the step (via `handleEvent`), is the single synchronous install block, sets `paused = true` on a failed arrival, and calls `autosave()` last [VERIFIED: src/app/game-session.ts:2061-2158]. World teardown/populate and the `epoch` bump join this block and must not throw inside it.
- The hook binds to the live `FlightState` object: `bindTestHook(activeState)` is called at boot (`testHookEnabled = new URLSearchParams(window.location.search).get("test") === "1"`) and again after every in-session Load (`if (testHookEnabled) bindTestHook(restored.state)`) [VERIFIED: src/app/game-session.ts:1034-1048, 1418, 3184-3186]. The new hook methods must read live context fields, never a captured state.

### Pattern 2: Step 0 and the source-scan tests
**What:** two tests read the session as text.
- `tests/app/redraw-gate.test.ts:113-155`: exactly one `renderFrame(alpha, shouldDraw())`; the list of comma-containing `renderFrame(...)` calls must `toEqual` the **ordered** pair `["renderFrame(alpha: number, draw = true)", "renderFrame(alpha, shouldDraw()"]`; exactly five `redrawGate.request();`; `redrawGate.next(paused || state?.mode === "docked", drawKeys())`; `return [state, scene, scene?.nebulae?.revision() ?? 0];`; `probe.frames += 1;`; `probe.renders = renderer.info.render.frame;` [VERIFIED: tests/app/redraw-gate.test.ts:112-155].
- `tests/guards/economy-purity.test.ts:201-207, 311-353`: `switchCaseBody(source, "docked")` takes the **first** `case "docked":` in the text; exactly three `generateMarket(` producers; three regexes on `arrivalMarketSeed`/`savedSystem`/`restoredMarketSeed`; no `Date.now`/`performance.now`; also the two-field profile literal scan reads `src/app/game-session.ts` [VERIFIED: tests/guards/economy-purity.test.ts:201-207, 307-353].
**Implication for the helper (`tests/helpers/session-source.ts`):** concatenate `game-session.ts` plus `src/app/session/**/*.ts` in a fixed sorted order (a comparator, not bare `.sort()` is fine in tests, but keep it deterministic). Make the redraw-gate assertion order-independent (assert the pair as a set/length-2 with both members) because after the split the declaration (in `render-driver.ts`) and the gated call (in `frame-loop.ts`) land in alphabetical order frame-loop < render-driver, reversing the current order. Keep `case "docked":` unique across the concatenation: today it exists once (`src/app/game-session.ts:2321`) [VERIFIED: rg]; after the split it must stay once (in the event-router `stationFlow` subscriber). If a second `switch` over `"docked"` is introduced elsewhere, `switchCaseBody` may scan the wrong body. Step 0 must be green against the unmodified monolith.

### Pattern 3: Probe-shape snapshot (before step 1) and the post-split deliberate commit
**What:** `tests/guards/probe-lock.ts` is the guard-probe lock, not a probe-shape check [VERIFIED: file header]. A new Playwright spec `tests/e2e/probe-shape.spec.ts` serialises the shape of `window.__wegolite` (recursive: sorted keys, `typeof` per leaf, `null` kept distinct, arrays as the sorted set of element shapes, functions as `"function"` for `probe.test`) at: menu, docked, in-flight, paused, chart-open, after a save. It must wait on `probe.frames` increments, never on wall time (PITFALLS 11). The expected shapes are committed JSON fixtures (prettier will format them; `.prettierignore` does not exclude `tests/golden` generally, so write them formatted or add an ignore line like the existing `dock-port.json` precedent).
**Volatile optional keys:** fields that appear only after time passes (`hint`, `restore`, `dust`, `world`, `shipVisible`) must be handled by sampling at a deterministic point or by an explicit allow-list; the spec must still fail on any added/removed/renamed key (D-13) in the sampled states.
**Fast-gate membership:** `verify` runs `npm run test:e2e:fast` = `playwright test --project=chromium tests/e2e/scene.spec.ts tests/e2e/docking.spec.ts tests/e2e/save-load.spec.ts` [VERIFIED: package.json scripts]. Because D-12 requires `verify` green per split step, add `tests/e2e/probe-shape.spec.ts` to `test:e2e:fast` in the step-0 plan (split track owns `package.json` scripts for this).
**Post-split deliberate commit:** add `probe.sim = { tick, epoch, entities, traffic, clock }` (cheap integers/booleans, published every frame) and hook methods `advanceTicks(n)` / `worldHash()` (functions, under `?test=1` only), and update the shape fixture in that same commit. Do not compute the hash per frame (28 KB text at 40 ships, ARCH §16).

### Pattern 4: Entity model and store
**What (ARCH §5, adapted to the locked ids):**
```ts
export type EntityId = number;                  // plain alias (discretion)
export const NO_ENTITY = 0;
export const PLANET_ID = 1; export const SUN_ID = 2; export const MAIN_STATION_ID = 3;
export const WITCHPOINT_BUOY_ID = 4; export const STATION_NAV_BUOY_ID = 5;
export const PLAYER_ID = 100;                   // supersedes ARCH §5.1's PLAYER_ID = 1 (D-06)
export const FIRST_DYNAMIC_ID = 101;
export const MAX_ENTITIES = 256;                // dynamic entities only; statics are never stored
```
- Store = dense array ascending by id (spawns append the next monotonic id) plus an `id -> index` `Map` used **for lookup only**; `kill` sets `dead`, `commit()` compacts in place and rebuilds the index and returns removed ids; `live` includes entities spawned this tick; `get(id)` returns `undefined` for missing or dead; `spawn` returns `undefined` when `live.length >= MAX_ENTITIES` and does **not** advance `nextId` on failure (decision for the planner to confirm; D-05 only requires counter parity between traffic on/off).
- Update passes capture `const n = store.live.length` first and iterate `0..n-1`; spawned-this-tick entities are first updated next tick (ARCH §5.3, Oolite `Universe.m:6432-6439` retained copy) [VERIFIED: /home/opencode/git/oolite/src/Core/Universe.m:6432-6439 "use a retained copy so this can't be changed under us"].
- Oolite facts behind the id design (quoted): `MIN_ENTITY_UID = 100`, `NO_TARGET = 0`, `UNIVERSE_MAX_ENTITIES = 2048` [VERIFIED: oolite/src/Core/OOTypes.h:168-171]; `if (u_id == 100) return PLAYER;` [VERIFIED: Universe.m:4841-4846]; allocation scans `while (entity_for_uid[next_universal_id] != nil)` and wraps, which permits stale-id aliasing — the monotonic counter is the deliberate divergence [VERIFIED: Universe.m:5014-5029].
- Static bodies: `WorldView.body(id)` synthesises ids 1-5 from `SystemLayout` (`planet`, `sun`, `station`, `witchpoint`, `navBuoy` each `{ position, radius }`) [VERIFIED: src/sim/world/layout.ts:46-52 `readonly planet: Body; readonly sun: Body; readonly station: Body; readonly navBuoy: Body; readonly witchpoint: Body;`]. Mapping: id 4 -> `layout.witchpoint`, id 5 -> `layout.navBuoy`. The station's orientation must apply `FlightState.stationAngle` (rolled about local +Z) on top of `layout.stationBaseQuat`; read the angle from the player state passed to the view. Player id 100 is an adapter over `FlightState` (position, orientation, `speed` scalar plus `impulse`).
- Cap and ids: the cap counts dynamic entities only (statics are not stored). Reserve ids 6..99 by never allocating below `FIRST_DYNAMIC_ID`.

### Pattern 5: World hash composed so an empty world equals `hashFlight` (D-08)
**What:** `hashFlight(state)` is `fnv1a32(serializeFlight(state))` and `serializeFlight` ends with the line `repairCount=...` (no trailing newline) [VERIFIED: src/sim/flight/state.ts:147-181]. Compose, never extend:
`hashWorld(player, world) = fnv1a32(serializeFlight(player) + section)` where `section === ""` when the world is absent **or has never spawned anything**, otherwise `"\n" + lines.join("\n")`.
- "Never spawned" = `world.nextId === FIRST_DYNAMIC_ID` (and no live entity). Do **not** include `worldSeed`, `epoch`, static bodies, or `nextId` while that holds: `epoch` is bumped at every launch/arrival (D-02) and would otherwise break D-08 on the first launch. Once anything has spawned, include `nextId`, the world stream state, and one labelled line per live entity in ascending id (position/orientation via `canon`, integer ticks via `canon(n, 0)`, every RNG stream state, AI component with params emitted in a comparator-sorted key order, `repairs`).
- Hash per entity as well (a failing test should name the first diverging id): expose `entityHashes(world): readonly [EntityId, string][]` for tests.
- `canon` throws on non-finite input and normalises `-0` [VERIFIED: src/sim/hash.ts:29-35 `if (!Number.isFinite(n)) { throw new Error(...) }` and `return (r === 0 ? 0 : r).toFixed(digits);`]. A NaN entity therefore crashes the frame loop: run `sanitizeEntity` once per tick before hashing (Pitfall 9).
- No pinned flight-hash constants exist today (the cadence tests assert equality across cadences only; goldens are the kinematic probe, hyperspace routes, market, content and saves) [VERIFIED: rg `hashFlight` in tests; ls tests/golden]. To make "v1 flight hash" an actual regression pin, record a few `hashFlight` values from the **unmodified** tree (Wave 0) into a new additive golden, e.g. `tests/golden/world/flight-v1-hashes.json`, and assert both `hashFlight` and `hashWorld(player, emptyWorld)` equal them at sampled ticks of three recorded flights (the `flight-cadence` script, a dock approach, a hyperspace jump). New golden files are additive; do not regenerate existing ones.

### Pattern 6: Serialisable RNG and forked streams (FOUND-12)
**What:** `createSeededRandom` is mulberry32 with the state in a closure [VERIFIED: src/sim/math.ts:227-237]. ARCH Pattern 4's `rngNext` is the same arithmetic (`state + 0x6d2b79f5`, `imul(t ^ t>>>15, t|1)`, `t ^= t + imul(t ^ t>>>7, t|61)`, `(t ^ t>>>14) >>> 0) / 4_294_967_296`) [VERIFIED by comparing both listings]. Implement `createSeededRandom(seed)` as a thin wrapper over `rngNext` inside `math.ts` (core track owns `math.ts`), so `drawWitchpointExit` keeps its exact draw order with **zero edits to `arrival.ts`** (FIDELITY.md pins `src/sim/hyperspace/arrival.ts:125`; the contract test only checks the line is inside the file, but not touching the file avoids any churn) [VERIFIED: src/sim/hyperspace/arrival.ts:73 `const next = createSeededRandom(seed);`; FIDELITY.md references `src/sim/hyperspace/arrival.ts:125` and `src/sim/flight/step.ts:218`; tests/contract/fidelity.test.ts header].
- Pin the algorithm with literal vectors captured from the **current** closure in Wave 0 (first N outputs for a few seeds) so delegation can never drift; the existing hyperspace arrival tests and `tests/golden/hyperspace/routes.json` give a second, independent proof.
- Seed derivation (one-way once Phase 11 lands, D-02). **Superseded guidance (revised 2026-11-12):** an earlier draft of this section recommended string-FNV seeds after the repo precedent of `marketSeedForSystem` (`Number.parseInt(fnv1a32(`${systemId}:0`), 16) >>> 0`, [VERIFIED: src/sim/economy/market.ts:41-43]), that is `worldSeedFor` and `forkSeed` as `parseInt(fnv1a32(...), 16) >>> 0` over colon-joined strings. That recommendation contradicts locked decision D-02 and is withdrawn: D-02 fixes `worldSeed = mix32(marketSeed, epoch)`, and plan 08-02 (option-a, the default the owner confirms at its Task 2 checkpoint) implements it in `src/sim/rng.ts` with integer arithmetic only: `fmix32` (the MurmurHash3 finaliser), `mix32(a, b) = fmix32((a >>> 0) ^ fmix32((b + 0x9e3779b9) >>> 0))`, `worldSeedFor(marketSeed, epoch) = mix32(marketSeed, epoch)` and `forkSeed(worldSeed, entityId, purpose) = mix32(mix32(worldSeed, entityId), RNG_PURPOSE_CODES[purpose])` with `purpose` a closed union and fixed purpose codes world 1, ai 2, combat 3 (D-04). `marketSeedForSystem` stays the producer of the uint32 `marketSeed` input only; a string-FNV world or fork seed exists only if the owner explicitly revises D-02 (08-02 option-c). **Pin `fmix32`, `mix32`, `worldSeedFor` and `forkSeed` with literal test vectors the moment they exist (plan 08-02 Task 3): the exact arithmetic is the contract.**
- Per-entity state: a fixed-shape record per `RngPurpose` (closed union, iterated through a `const RNG_PURPOSES` array, never `Object.keys`), every state a `uint32` number stored in the entity and included in the hash and snapshot. World-level stream `world.rng` forked as `(worldSeed, 0, "world")`.
- Tests: spawning/killing entity B leaves entity A's draw sequence unchanged; same `(worldSeed, id, purpose)` reproduces; two purposes differ.

### Pattern 7: Snapshot codec and the 1,000-tick equality (FOUND-12 criterion 3)
**What:** `snapshotWorld(world): WorldSnapshot` (plain JSON-safe data: `nextId`, world stream, entities ascending, per-entity components, RNG states, AI component) and `restoreWorld(layout, worldSeed, snapshot)`; `parseWorldSnapshot(unknown)` validates at the boundary (principle-boundary-discipline): ids unique and strictly ascending and `>= FIRST_DYNAMIC_ID`, `nextId > maxId`, count `<= MAX_ENTITIES`, all numbers finite, tick timers integers, RNG states uint32, known `specKey`/`aiKey`/`BehaviourId` values. It is test-only this phase but Phase 11 will reuse it for saves, so make failures typed (`SnapshotError`).
- The player is not part of the world snapshot. The equality test clones the `FlightState` (`structuredClone` in tests; it is plain data) alongside the snapshot.
- Equality test shape: a scenario with entities spawned and killed so id gaps exist and `nextId` exceeds the live count; run to tick k live, `JSON.stringify` the snapshot, `JSON.parse`, restore, then run both worlds to tick 1,000 comparing `hashWorld` at every 50-100 ticks and at the end. Include a restore into a store built in a **different insertion order** to prove no `Map`-order decision exists (PITFALLS 1; ARCH §5.3 rule 5), a killed-highest-id case (the id must not return after restore), and a `-0` case.
- JSON cannot carry `-0`, `NaN` or `Infinity` (`-0` becomes `0`; others become `null`). `canon` hides `-0` in the hash, but a later `Math.atan2(-0, -1)` differs from `Math.atan2(0, -1)`, so `sanitizeEntity` should normalise `-0` to `0` every tick. [ASSUMED: -0 divergence risk is low in Phase 8 because no steering is ported yet; the guard is cheap.]

### Pattern 8: Lint bans and the AI zone (container-verified)
**Existing zone:** `files: ["src/sim/**/*.ts"]` sets `no-restricted-imports` (three, settings, content catalogue, render/ui/input/app/persistence, content loaders), `no-restricted-globals` (the `DOM_GLOBALS` list incl. `performance`, `fetch`), `no-restricted-properties` (`Math.random`, `Date.now`, `performance.now`) and `no-restricted-syntax` (only `NewExpression[callee.name="Date"]`) [VERIFIED: eslint.config.js:15-30, 71-160]. Today nothing bans `for..in`, bare `.sort()`, or `Date.UTC`/`Date.parse`/`Date()`.
**Experiment (container, ESLint 10.14.0 + typescript-eslint, config mirroring the real rule shapes; scripts kept under the session scratchpad, not in the repo):**
```
for-in          => no-restricted-syntax: no for..in
sort0           => no-restricted-syntax: bare sort          (a.sort())
sort1           => clean                                     (a.sort((x,y)=>x-y))
toSorted0       => no-restricted-syntax: bare toSorted
Date.now / Date.UTC / Date() / new Date => no-restricted-globals: Unexpected use of 'Date'
Date type ref (f(d: Date))              => clean
performance.now => no-restricted-globals: Unexpected use of 'performance'
Math.random, Math['random']             => no-restricted-properties
const m = Math; m.random()              => clean   (known gap; optional extra selector)
ai: ../flight/state.js, ../world/store.js, ../../content/types.js, `import type` of ../flight/state.js, export-from => no-restricted-imports (allow-list regex)
ai: ../world/view.js, ../math.js        => clean
ai: dynamic import('../flight/state.js') => CLEAN  (needs an ImportExpression selector)
ai block only restates no-restricted-imports: sim-zone three-ban message was NOT reported => the later block REPLACES the rule options, it does not merge
```
**Rules to add (core track owns `eslint.config.js`):**
1. In the `src/sim/**/*.ts` block: `no-restricted-syntax` gets `ForInStatement`, `CallExpression[callee.property.name="sort"][arguments.length=0]` (and `toSorted`), keeping the existing `new Date` selector. `no-restricted-globals` gets `Date` (and recommended `setTimeout`, `setInterval`, `setImmediate`, `process`, `crypto`) in addition to `DOM_GLOBALS`. Rejecting only the *value* `Date` is fine: type positions stay legal. No existing file in `src/sim` uses any of these [VERIFIED: rg for `\bDate\b`, `for (... in`, `.sort()`, timers, `process`, `crypto` in `src/sim`: only a comment in `hash.ts` and a comparator `sort` in `economy/market.ts:169`]. `Math.sin/cos/acos` are used in `math.ts` and are intentionally **not** banned (the file documents the within-engine claim; PITFALLS 4 says keep the hash claim narrow).
2. AI zone: a block `files: ["src/sim/ai/*.ts"]` and a second `files: ["src/sim/ai/pilots/*.ts"]` (a regex cannot know the importing file's depth), each with `no-restricted-imports` using one `patterns: [{ regex, message }]` allow-list: relative `./` siblings, `../` AI-level siblings for pilots, and exactly `math`, `world/ids`, `world/view`, `world/control` of the sim root. Because the later block replaces the rule, anything not on the allow-list (bare packages, `three`, `zod`, `../flight/**`, `../world/store`, `../../content/**`, even `import type`) is rejected. Add `no-restricted-syntax: ImportExpression` for the AI zone, **repeating** the sim-zone selectors, because that rule is also replaced.
3. Factor the shared pattern list and syntax selectors into `const` arrays at the top of `eslint.config.js` (`SIM_IMPORT_PATTERNS`, `SIM_SYNTAX_BANS`) and spread them in both blocks, so a future edit cannot silently diverge.
**Proofs:** one guard test file per concern (`tests/guards/sim-determinism-bans.test.ts`, `tests/guards/ai-zone.test.ts`) using the existing `withProbe`/`lintProbe` pattern: write a probe under `src/sim/...` (or `src/sim/ai/...`), lint through the real config, assert the rule id/message, delete in `finally`, serialised by `withProbeLock`. Add a **positive control** per rule (a compliant probe lints clean) so the test can see both outcomes. The real `src/sim/ai/pilots/test-pilot.ts` is the live proof that a conforming module lints clean.

### Pattern 9: The AI seam and the test pilot (FOUND-13)
- `WorldView` (types only, `src/sim/world/view.ts`): `tick`, `playerId`, `isValid(id)`, `ship(id): ShipView | undefined`, `body(id)` for statics/player, `scan(self, range, filter?)` returning ids sorted by `(distanceSquared, id)` with an explicit comparator, `mainStation()`, `mainPlanet()`, `sun()`, `nearestStation(self)`, `countWithRole(role)` (ARCH §7.3). Add methods only when needed (Pitfall 19); Phase 8 needs `tick`, `isValid`, `ship/body`, `scan`, and the three static getters. Return fresh plain objects with copied vectors so no live reference leaks.
- `ShipControl` (types only): keep the ARCH id-addressed signatures for the writes the pilot needs (`setTarget`, `setDestination`, `setDesiredRange`, `setDesiredSpeed`, `perform(BehaviourId)`, `scheduleWake`); omit `fireMissile`, `fireECM`, `launchPod`, `dumpCargo`, `setBounty`, `say` until a later phase needs them (each can be a one-line addition). Implement `createShipControl(world, actorId)` so a call whose `id !== actorId` is a no-op: Pitfall 7 ("handlers may mutate only the receiving entity") becomes structural.
- `BehaviourId`: a closed string union mirroring `OOBehaviour.tbl` (39 `ENTRY` lines, e.g. `IDLE`, `TRACK_TARGET`, `STOP_STILL`, `ATTACK_TARGET`, `FLEE_TARGET`, `AVOID_COLLISION`, `FLY_RANGE_FROM_DESTINATION`, `FLY_TO_DESTINATION`, `FACE_DESTINATION`, `LAND_ON_PLANET`, `INTERCEPT_TARGET`, `FORMATION_FORM_UP`, `TRACTORED`, `SCRIPTED_AI`) [VERIFIED: oolite/src/Core/Tables/OOBehaviour.tbl, `rg -c ENTRY` = 39]. Declare the full union now (cheap, closed); implement only a minimal set in `stepWorld`. `ScanClass` likewise from `OOScanClass.tbl` (`CLASS_NO_DRAW`, `NEUTRAL`, `STATION`, `TARGET`, `CARGO`, `MISSILE`, `ROCK`, `MINE`, `THARGOID`, `BUOY`, `VISUAL_EFFECT`, `WORMHOLE`, `PLAYER`, `POLICE`, `MILITARY`) [VERIFIED: Tables/OOScanClass.tbl].
- `AiComponent` per ARCH §7.2 (`roleAi`/`aiKey`, `params: Record<string, ParamValue>`, `wakeTick`, `nextThinkTick`, ...). Phase 8 needs only the fields the pilot uses; anything with `Record` keys is serialised in comparator-sorted key order. Timers are absolute integer ticks compared with `view.tick` (the player's `FlightState.tick`, which increments every `stepFlight` in every mode: `state.tick += 1;` is the unconditional last statement before `return events;`) [VERIFIED: src/sim/flight/step.ts:347,351 region; rg shows a single `return events`]. A single `ticks(seconds)` helper (`Math.max(1, Math.round(seconds * 120))`, ARCH Pattern 3) owns seconds-to-ticks; the legacy AI think interval is 15 ticks (0.125 s at 1/120) [CITED: ARCH §7.1].
- Test pilot (`src/sim/ai/pilots/test-pilot.ts`): a small state machine (for example `seek -> hold`) that on each think reads `view.scan(self, range)`, picks the first id (distance, then id), calls `ctl.setTarget/setDestination/setDesiredSpeed/perform`, draws its reconsider jitter from the per-entity `"ai"` stream, and `ctl.scheduleWake` with integer ticks. Proofs: (1) JSON round trip of `AiComponent` is deep-equal and produces identical subsequent behaviour; (2) every timer field is an integer after every think; (3) with a recording `ShipControl` and a fake `WorldView` the pilot is a pure function (testability goal); (4) adding another entity does not change its RNG draws; (5) lint rejects an AI probe importing `../flight/state.js`.
- `stepWorld` AI phase dispatches through `AI_REGISTRY[ai.aiKey]` (in `src/sim/ai/registry.ts`); `src/sim/world/step.ts` imports the registry, the AI files import only seam types and constants, so there is no import cycle.
- Placeholder motion: a 1,000-tick equality test is only meaningful if state evolves. Evolution can come from the pilot's nav writes, per-tick RNG draws and a minimal kinematic update (`position += forward * speed * DT`) in W1, flagged in FIDELITY/PROJECT as a placeholder replaced by the Phase 12/13 motion port. See Open Question 5.

### Pattern 10: Manual clock, `advanceTicks`, traffic flag, and the join plan (FOUND-14)
- **Flags:** a pure `parseTestFlags(search: string): { hook: boolean; manualClock: boolean; traffic: boolean }` (Node-testable, new `src/app/session/test-flags.ts`): `hook` iff `test === "1"` exactly (the existing rule); `manualClock` iff `hook && clock === "manual"`; `traffic` iff `hook && traffic === "1"`. Unknown values are false. Read once at boot next to the existing `testHookEnabled` line.
- **Manual-clock frame:** `frame()` keeps rendering and the probe update but never calls `GameLoop.advance` and never drains the keyboard command queue; it uses alpha `1` so the latest pose is drawn. `advanceTicks(n)` owns the drain-filter-autosave-hyperspace-edge mapping that the realtime branch does today, then calls the same `stepOnce(commands)` n times with commands on the first step only. Do **not** re-run the "drained contains launch -> pre-launch autosave" rule on every frame while a launch is still pending (it would autosave every frame in manual mode); run it once, at drain time inside `advanceTicks`.
- **Extract `stepOnce`** from the `loop.advance` callback in the split's step 8 so realtime and manual share one code path; `GameLoop` and `src/sim/loop.ts` stay untouched (their tests pin them).
- **`advanceTicks(n)` contract:** validate `Number.isSafeInteger(n) && n >= 1 && n <= MAX_ADVANCE_TICKS`; return the new tick; no-op returning the unchanged tick when paused or a chart/save screen is open (they freeze the sim today); taint the profile and call `redrawGate.request()` (every hook mutation taints; autosave skips a tainted profile). Events produced by each tick go through the same `handleEvent` path (messages, station show, autosave-skip), so a launch/dock/jump inside `advanceTicks` behaves as in play.
- **`worldHash()`:** a hook function `() => string` that returns `hashWorld(player, world)`, computed on demand. `probe.sim.tick` publishes `state.tick` each frame.
- **Traffic:** `populate` is an injected seam `(world, { traffic }) => void` invoked at each bump (launch, arrival, in-flight restore), a no-op in Phase 8 even with `traffic: true`. `epoch` and `nextId` advance identically for both settings (D-05). A Vitest test asserts the seam is not called for `traffic:false` and called once per bump for `traffic:true`; the browser spec asserts `probe.sim.traffic` and `probe.sim.entities === 0` by default.
- **World lifecycle (Phase 8):** the world exists while mode is `launching` or `inFlight` (ARCH §8.2). `createWorld` at the `launched` event (bump `epoch`), at hyperspace arrival inside the atomic install block (bump `epoch`), and at in-flight Continue (no bump, see Open Question 2); drop at `docked`. Hash while no world exists is `hashFlight(player)`. The world must never hold the `FlightState` reference: pass the live player into `stepWorld`/`createWorldView` per call (G-8).
- **Browser/Vitest parity (criterion 5):** put the scripted tick plan (start from a new game, queue `launch`, `advanceTicks(1)`, then `advanceTicks(K)` with idle input) in one shared helper (`tests/helpers/tick-script.ts`) that both a Vitest test and the Playwright spec execute against pure `src/sim` (the spec can compute the expected hash in Node: existing specs already import `src/` modules through `tests/e2e/helpers/chart.ts`, which imports `src/content/types.js` and `src/ui/chart-model.js`). The Node replay must use the same `StepOptions` as the browser (`dock: createDockGeometry(...)`, equipment, hyperspace facts); the cleanest guarantee is that `sim-driver` builds options through one pure exported function that the Node replay also calls (no THREE, no DOM, no Vite-only import such as `import.meta.glob`). If the dock geometry affects the compared window, load the dock-port JSON with `readFileSync` like `laveFixture` does.

### Pattern 11: Suggested plan decomposition (planner's call)
Wave 0: baseline `verify-full` (record time), probe-shape spec + fixtures, session-source helper + re-pointed tests, pinned v1 flight-hash and RNG vectors. Track A (split): steps 1-9 as sequential plans (1 commit each, `verify-full` at 3/6/9), 8 includes `stepOnce` extraction and the pure step-options builder. Track B (core, parallel): B1 rng + lint bans (touches `math.ts`, `eslint.config.js`), B2 ids/entity/store, B3 hash/world/view/control/sanitize/snapshot, B4 AI seam + test pilot + AI zone proofs + reserved events, B5 `stepWorld`/`stepSim` + cadence + 1,000-tick equality. Integration (after A8 and B5): `stepSim` in `sim-driver`, lifecycle hooks, flags, `advanceTicks`, `worldHash`, `probe.sim`, fixture update, e2e `tick-hook.spec.ts`, Key Decisions rows. Record each deliberate divergence from Oolite (id-order updates instead of distance order; queued AI events; monotonic ids) in `.planning/PROJECT.md` Key Decisions; the FIDELITY contract test requires every divergence to quote a Key Decisions row, so add FIDELITY rows only if a new ported mechanic is mapped (Phase 8 ports none).

### Anti-Patterns to Avoid
- **Editing `arrival.ts` or `flight/step.ts`** just to use the new RNG/world; they carry FIDELITY pins.
- **Capturing `state`/`layout`/`scene` in a module-level variable** of an extracted controller (G-8, `drawKeys()` identity compares).
- **Putting the world, epoch, seed or statics into `serializeFlight`/`hashFlight`** (invalidates the cadence/dock/hyperspace tests at once, PITFALLS 9).
- **Iterating a `Map`/`Set`/object for any sim decision**, bare `.sort()`, `for..in`, `Math.random`, `Date`.
- **One shared RNG stream**, or streams keyed by array index instead of id.
- **A per-frame `worldHash` in the probe.**
- **A `toEqual` on an ordered concatenation** in the re-pointed scan tests.
- **Regenerating any existing golden** (`tests/golden/**`) to make the split pass.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hash text | New hash or `JSON.stringify` | `fnv1a32` + `canon` from `src/sim/hash.ts`, fixed key order | Throws on non-finite (a feature), normalises `-0`, matches `hashFlight` |
| Seeded draws | New PRNG algorithm | mulberry32 already in `math.ts`, object-state form with the identical sequence | v1 arrival goldens depend on the exact stream |
| Seed derivation | A new or ad-hoc mixer, or string-FNV world seeds (superseded guidance, revised 2026-11-12: an earlier draft recommended the `economy/market.ts` string-FNV precedent here) | `mix32` from `src/sim/rng.ts` exactly as locked D-02 names it (plan 08-02: the MurmurHash3 finaliser `fmix32`, `worldSeedFor = mix32(marketSeed, epoch)`, `forkSeed = mix32(mix32(worldSeed, entityId), purpose code)`) | Integer-only and engine-independent (`Math.imul`, unsigned shifts), fixed by D-02, test-vector pinned |
| Zone enforcement | A plugin or custom ESLint rule | Core `no-restricted-imports` (`regex` allow-list), `-globals`, `-syntax` | Verified in the container; no dependency change |
| Probe lint proofs | Ad-hoc `spawnSync eslint` | `lintProbe` + `withProbe` + `withProbeLock` | Shared program, serialised against `tsc` globbing |
| Store invariants tests | Hand-written case lists only | fast-check properties over random spawn/kill/commit/snapshot sequences | Already installed; finds id-reuse and order bugs |
| ECS | bitecs/miniplex/koota | Hand-rolled dense array store | STACK.md Decision 1 |
| Snapshot validation | Trust `JSON.parse` | Strict hand-written `parseWorldSnapshot` returning typed data or `SnapshotError` | Boundary discipline; Phase 11 reuses it |

**Key insight:** the value of this phase is the *contracts and their mechanical proofs* (hash identity, id order, snapshot equality, lint zones), not the amount of simulation. Prefer the smallest world step that makes those proofs non-vacuous.

## Runtime State Inventory

This phase is a refactor (the session split) plus additive world code, so the five categories are answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | IndexedDB save blob (schema v2, `MAX_SAVE_CHARS = 65,536`) and settings in localStorage. Phase 8 does not change either schema (`epoch` is session-memory only, D-03; Phase 11 persists it). | None — verified by scope (CONTEXT D-03, boundary text). Add a regression test only if a split step touches `snapshotForSave` inputs (the save-controller step must keep `buildSnapshotInputs` byte-for-byte equivalent). |
| Live service config | None — static client, no external service (AGENTS.md: no backend). | None |
| OS-registered state | None. | None |
| Secrets / env vars | None read by the app; Compose env only (`WEGOLITE_E2E_WAIT_SCALE`, `WEGOLITE_REUSE_PREVIEW`, `CI`). | None |
| Build artifacts / installed packages | `dist/` (rebuilt by `npm run build`), the named `wegolite-node-modules` volume (unchanged because `package.json` is not edited), `test-results/`. New files need no reinstall. A stale Vite preview server is reused locally only with `WEGOLITE_REUSE_PREVIEW=1`; rebuild before every e2e run. | None beyond rebuilding before e2e |

**Canonical question:** after every file in the repo is updated, what runtime systems still hold the old shape? Only the browser's already-written v2 save, which is untouched. The `window.__wegolite` probe is rebuilt each page load.

## Common Pitfalls

### Pitfall 1: Order-dependent source-scan tests break on a correct split
**What goes wrong:** `redraw-gate.test.ts` `toEqual`s an ordered pair and `economy-purity.test.ts` scans the first `case "docked":`; concatenating files alphabetically reverses the pair and a stray `case "docked":` elsewhere changes the scanned body.
**Why it happens:** the tests were written against one file.
**How to avoid:** step 0 makes the assertions order-independent and structurally equivalent, proves them green on the monolith, and keeps `case "docked":` in exactly one file; the helper must fail loudly if it finds zero or more than one session source (vacuity guard).
**Warning signs:** a split step that "fixes" a count by editing a regex.

### Pitfall 2: Probe shape drifts silently
**What goes wrong:** a refactor adds, renames or drops a probe key, or changes `probe.renders` semantics while idle; 25 specs read the probe.
**How to avoid:** the pre-split shape spec (Pattern 3), added to `test:e2e:fast`; `publishProbe` stays once and the probe object is mutated in place.
**Warning signs:** any diff touching `src/app/probe.ts` field names or `updateProbe` assignments during steps 1-9.

### Pitfall 3: `commands go to the first step only` and pre-launch autosave break in the manual clock
**What goes wrong:** re-evaluating the launch-drain autosave every manual frame, applying commands to every tick, or rendering at alpha 0 after `advanceTicks`.
**How to avoid:** Pattern 10; unit-test `sim-driver` with fakes: commands appear on tick 1 only, autosave decision runs once per drain, `advanceTicks(0)`/negative/NaN/huge rejected.

### Pitfall 4: New sim/app files trip the source-scan guards
**What goes wrong:** `tests/guards/sim-purity.test.ts` fails if any file under `src/sim` has an import specifier containing `input`, or if any file under `src/sim` (other than `state.ts`), `src/input` or `src/app` declares a type whose name contains `Frame` and whose next 24 lines mention both `pitch` and `roll` [VERIFIED: tests/guards/sim-purity.test.ts `declaredFrameTypes`, `importSpecifiers`, and the "never imports the input layer from src/sim" test].
**How to avoid:** name files/specifiers without `input` (use `controls`, `ctl`, `intent`) and avoid `*Frame*` type names near `pitch`/`roll` text.

### Pitfall 5: Later ESLint config block silently drops the zone's other bans
**What goes wrong:** adding `no-restricted-syntax` or `no-restricted-imports` to the AI block replaces the sim block's list (verified: the three-ban message disappeared). A banned `Date` or `for..in` could then pass in `src/sim/ai/**`.
**How to avoid:** shared `const` arrays spread into both blocks; a guard test that a probe in `src/sim/ai/` with `for (const k in o)` and `Date.now()` still fails lint.

### Pitfall 6: Hash identity broken by seed/epoch/statics
**What goes wrong:** including `epoch`, `worldSeed`, static bodies or `nextId` in the empty-world section changes the v1 hash on the first launch.
**How to avoid:** Pattern 5 rule (section empty until anything ever spawned); the recorded-flight equality test must cover a launch (epoch bump) and an arrival (second bump).

### Pitfall 7: Id reuse and Map-order after restore
**What goes wrong:** `commit()` or restore recomputes `nextId` as `max(live)+1`, handing a dead entity's id back; or code iterates the id index `Map`.
**How to avoid:** `nextId` is stored state and only increments; restore uses the stored value (validated `> maxId`); fast-check property "ids ever allocated are unique"; restore-in-reversed-order test.

### Pitfall 8: Per-entity RNG streams keyed by index or created lazily
**What goes wrong:** a stream seeded from array position, or forked at first use, so spawn order or call order shifts draws; a stream state omitted from the hash lets diverged worlds hash equal.
**How to avoid:** fork at spawn from `(worldSeed, id, purpose)`; include every state in hash and snapshot; isolation tests.

### Pitfall 9: NaN/`-0` entity crashes the loop
**What goes wrong:** `canon` throws on a non-finite value, which inside `frame()` kills the game; `-0` does not survive JSON.
**How to avoid:** `sanitizeEntity` before hashing, repair count in the entity line and asserted zero in the golden scenarios; guards for zero vectors in any steering added later.

### Pitfall 10: The test hook captures state
**What goes wrong:** a hook or world holding the `FlightState` object goes stale after a Load or arrival (the G-8 bug).
**How to avoid:** the hook methods read live context getters; the world takes the player per call; keep the existing rebind after Load.

### Pitfall 11: `advanceTicks` stalls the page or hides a hang
**What goes wrong:** an unbounded `n` blocks the main thread; a promise-less hook hides errors.
**How to avoid:** hard cap, synchronous, returns the tick; e2e waits on `probe.frames`/`probe.sim.tick`, never on wall time or raised timeouts (PITFALLS 11).

### Pitfall 12: Behaviour change smuggled into the refactor
**What goes wrong:** folding fixes (chart pauses flight, torus message, per-step `Set` allocation) into split commits makes bisecting useless.
**How to avoid:** none of the deferred todos are in scope; the only permitted opportunistic fix is the per-step `Set` allocation (`equipmentSet()` is built every step at `src/app/game-session.ts:2814`), and only if behaviour-neutral [CITED: PITFALLS.md:231].

## Code Examples

Sketches only; none was compiled in this session (marked `[ASSUMED]` where a signature is a recommendation). The ESLint snippets were exercised by the container experiment.

### Code Example 1: Serialisable stream with the identical sequence
```ts
// src/sim/rng.ts  — same arithmetic as createSeededRandom (src/sim/math.ts:227-237)
export interface RngState { s: number }                 // uint32, plain data
export function rngNext(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}
// src/sim/math.ts
export function createSeededRandom(seed: number): () => number {
  const state: RngState = { s: seed >>> 0 };
  return () => rngNext(state);
}
// Source: ARCHITECTURE.md Pattern 4 + src/sim/math.ts (read this session). [ASSUMED: module name rng.ts]
```

### Code Example 2: Composed hash (empty section equals `hashFlight`)
```ts
export function hashWorld(player: FlightState, world: World | undefined): string {
  const section = world === undefined ? "" : serializeWorldSection(world); // "" until anything spawned
  return fnv1a32(serializeFlight(player) + (section === "" ? "" : `\n${section}`));
}
// hashFlight(state) === fnv1a32(serializeFlight(state))  (src/sim/flight/state.ts:181-183)
// Test: for every sampled tick of each recorded flight, hashWorld(player, world) === hashFlight(player).
```

### Code Example 3: Zone rules (container-verified shapes)
```js
const SIM_SYNTAX_BANS = [
  { selector: 'NewExpression[callee.name="Date"]', message: "No Date inside src/sim." },
  { selector: "ForInStatement", message: "for..in order is engine/insertion dependent; iterate an array or sorted keys." },
  { selector: 'CallExpression[callee.property.name="sort"][arguments.length=0]', message: "Bare .sort() is lexicographic; pass a total-order comparator." },
  { selector: 'CallExpression[callee.property.name="toSorted"][arguments.length=0]', message: "Bare .toSorted() is lexicographic; pass a comparator." },
];
// src/sim/**: "no-restricted-globals": [...DOM_GLOBALS, "Date", "setTimeout", "setInterval", "setImmediate", "process", "crypto"]
// src/sim/ai/*.ts (depth 1):
"no-restricted-imports": ["error", { patterns: [{
  regex: "^(?!\\./|\\.\\./(math|world/(ids|view|control))\\.js$)",
  message: "AI modules may import only the WorldView/ShipControl seam, ids and math." }] }],
"no-restricted-syntax": ["error", ...SIM_SYNTAX_BANS, { selector: "ImportExpression", message: "No dynamic import in the AI zone." }],
// Source: container experiment, ESLint 10.14.0 (outputs quoted in Pattern 8)
```

### Code Example 4: Entity store invariants (property test outline)
```ts
// fast-check: arbitrary sequence of spawn | kill(id) | commit | snapshot+restore
// invariants after every op: live ids strictly ascending; get(deadId) === undefined;
// the multiset of every id ever returned by spawn has no duplicates; nextId > every id ever issued;
// restore(snapshot(world)) has equal entityHashes and equal nextId.
```

### Code Example 5: Flags parser
```ts
export function parseTestFlags(search: string): { hook: boolean; manualClock: boolean; traffic: boolean } {
  const q = new URLSearchParams(search);
  const hook = q.get("test") === "1";
  return { hook, manualClock: hook && q.get("clock") === "manual", traffic: hook && q.get("traffic") === "1" };
}
// Mirrors the existing: new URLSearchParams(window.location.search).get("test") === "1" (game-session.ts:3184-3185)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Player-only `FlightState` hash | World hash composed on top (empty == v1) | This phase | Existing goldens remain valid evidence |
| Closure PRNG | Object-state PRNG with forked streams | This phase | Hashable, snapshot-able, isolated |
| Probe-only hook | `advanceTicks` under `?test=1&clock=manual` | This phase | Browser specs count ticks, not seconds (SwiftShader runs the sim at roughly 0.1x real time) |

**Deprecated/outdated:** ARCH §5.1's `PLAYER_ID = 1` (superseded by D-06). ARCH §12's wording that `Rng` lives "in `math.ts`" is satisfied by delegation, with the state type in `rng.ts`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `MAX_ADVANCE_TICKS` of about 200,000 is a sensible per-call cap | Pattern 10 | Too low blocks a long e2e wait (raise it); too high allows a multi-second main-thread stall |
| A2 | `mix32` seed derivation (locked D-02; plan 08-02) gives adequate stream independence for mulberry32 seeding. Superseded wording (revised 2026-11-12): an earlier draft assumed string-FNV seeds (`fnv1a32` over colon-joined strings), which contradicts D-02 and is withdrawn | Pattern 6 | Correlated streams; mitigated by plan 08-02's tests (distinct seeds and first draws for adjacent ids and purposes, 1,000 distinct world seeds over consecutive epochs) and by pinning `mix32`, `worldSeedFor` and `forkSeed` vectors before Phase 11 |
| A3 | A minimal kinematic update in W1 is acceptable scope and a placeholder for Phase 12/13 | Pattern 9, Open Q5 | If the owner wants no motion, the 1,000-tick test relies on pilot nav writes and RNG draws only |
| A4 | `-0` normalisation and per-tick `sanitizeEntity` are worth including now | Pattern 7 | Small extra code; omit if the planner judges it premature |
| A5 | New `src/sim/world/**` and `src/sim/ai/**` code can be tested enough to keep the `src/sim/**` coverage floors (lines 93, statements 91, functions 97, branches 86) | Validation | `npm test` (`vitest run --coverage`) fails the threshold; add tests for error branches (snapshot parse failures) |
| A6 | Probe additions are `probe.sim = {tick, epoch, entities, traffic, clock}` plus hook `advanceTicks`/`worldHash` | Pattern 3, 10 | Naming is discretion; changing it changes the one post-split fixture update only |
| A7 | The Playwright Node runner can import pure `src/sim` modules (and a THREE/DOM/Vite-free `sim-driver` helper) | Pattern 10 | If not, the spec reads a Vitest-written expected-hash fixture instead; evidence for the import mechanism is existing specs importing `src/ui/chart-model.js` and `src/content/types.js` [VERIFIED: tests/e2e/helpers/chart.ts:12-14] |

## Open Questions (RESOLVED)

Every question below was settled during planning; each entry names the decision or plan that resolves it.

1. **Does the world exist while docked?**
   - What we know: ARCH §8.2 says no (docked tears it down; launch creates it); D-08 needs `hashWorld(player, undefined) === hashFlight(player)`.
   - What's unclear: whether the owner wants a permanent `World` object holding statics for the whole session instead.
   - Recommendation: world absent while docked, present in `launching`/`inFlight`; `hashWorld` accepts `undefined`.
   - **RESOLVED:** no world while docked; the `launched` event creates it and the `docked` event drops it, and `hashWorld(player, undefined)` equals `hashFlight(player)`. Decided by D-02 (a populate happens at each launch and arrival) and D-08; implemented by plan 08-15 Task 1 (the `worldLifecycle` subscriber) and proven by plan 08-05 Task 1 (`hashWorld` with an absent world). The static bodies are stored in each world as fixed-id entities that reference `SystemLayout` (D-07, plan 08-05), so nothing static needs a session-long world.

2. **`epoch` on an in-flight Continue.** D-03 says the counter lives in session memory (starts at 0). A reload of an in-flight save has no saved epoch; bumping gives epoch 1, not bumping leaves 0.
   - Recommendation: create the world without bumping (the world is NPC-free in Phase 8, so unobservable); revisit in Phase 11 when `epoch` is persisted. Confirm with the owner only if a plan wants a stricter rule.
   - **RESOLVED:** an in-flight Continue or Load recreates the world with `resume(marketSeed)`, without a bump; Phase 11 (SAVE-07) revisits it when `epoch` is persisted. Decided under D-03 (session-memory epoch); implemented by plan 08-15 Tasks 2 and 3 and recorded in its Key Decisions row.

3. **Does `advanceTicks` taint the profile?** PITFALLS 11 says it "taints the profile and returns". Taint blocks autosave for the rest of the session, which is fine for determinism specs but means a manual-clock spec cannot also prove autosave.
   - Recommendation: taint (conservative, matches the hook rule); a spec that needs autosave uses the realtime clock.
   - **RESOLVED:** `advanceTicks` taints before its first step, so every autosave inside or after the call skips. Decided by the existing `?test=1` taint rule (PROJECT.md Key Decisions) and D-09; implemented and unit-proven by plan 08-14 Tasks 1 and 2.

4. **ShipControl addressing.** ARCH §7.3 is id-addressed; Pitfall 7 wants handlers to mutate only the receiving entity.
   - Recommendation: keep id-addressed signatures, enforce actor-only in `createShipControl(world, actorId)`.
   - **RESOLVED:** id-addressed signatures with actor-only enforcement in `createShipControl(world, actorId, tick)`; every write for another id is a no-op. Implemented and proven by plan 08-07 Tasks 1 and 2.

5. **Placeholder motion in Phase 8.** No motion model is ported until Phase 12/13.
   - Recommendation: a clearly labelled `position += forward * speed * DT` placeholder in W1 so the 1,000-tick equality, scan ordering and the pilot are non-vacuous; do not port `BEHAVIOUR_*` steering here.
   - **RESOLVED:** Phase 8 moves dynamic entities at their desired speed along their facing (a constant-speed integrator), and the Oolite thrust and attitude port stays in Phase 12/13. Implemented by plan 08-11 Task 1 and recorded as Key Decisions row (d) by plan 08-11 Task 3.

6. **Where does `stepSim` live and what is its signature?** Not fixed by any decision. Recommendation: `src/sim/sim.ts` exporting `stepSim(player, world | undefined, layout, config, intent, commands, dt, options): SimEvent[]` that calls `stepFlight` first and `stepWorld` only when a world is passed.
   - **RESOLVED:** `src/sim/sim.ts` exports `stepSim(player, world, layout, config, intent, commands, dt, options?)`; it calls the unchanged `stepFlight` first and `stepWorld` only when a world is passed and the player is launching or in flight. Implemented by plan 08-11 Task 1; plugged into the session's sim driver by plan 08-15 (D-14).

7. **Observable effect of `?traffic=1` in Phase 8.** No populator exists. Recommendation: the injected `populate` seam plus `probe.sim.traffic`; a Vitest spy proves call counts; the browser spec proves the flag is read once and off by default.
   - **RESOLVED:** the flag is parsed once at start-up by `parseTestFlags` (plan 08-14); the world lifecycle calls an injected `populate(world, { traffic })` at every world creation in both modes, and epoch and ids advance identically (D-05, D-10; plan 08-15 Task 2); `probe.sim.traffic` and the browser opt-in spec prove the default and the opt-in (plan 08-16).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | every test/build/lint | yes | 29.8.2 | — |
| Docker Compose | `docker compose run --rm <service>` | yes | 5.6.0 | — |
| Container Node | all tooling | yes | v24.22.2 (`docker compose run --rm lint node --version`) | — |
| `wegolite-ci` image (Chromium, Playwright, deps) | e2e specs | yes (image present; `lint` service ran) | pinned by `compose.yaml`/`Dockerfile` | `docker compose build` |
| Host Node | not authoritative | v26.10.0, no `node_modules` | — | do not use for evidence |
| Oolite checkout | reading upstream facts | yes (`/home/opencode/git/oolite`) | pin `7437f22` per ARCH | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` [VERIFIED: file read], so this section applies.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (unit/integration, one `unit` project, Node env) and Playwright 1.64.1 (Chromium; Firefox only for engine/core-loop) |
| Config file | `vitest.config.ts` (coverage thresholds on `src/sim/**` etc.), `playwright.config.ts` (workers 2, `testDir ./tests/e2e`) |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm verify` (per commit/wave); `docker compose run --rm verify-full` (phase gate; split steps 3, 6, 9) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-10 | Probe shape unchanged across the split (menu, docked, in-flight, paused, chart, saved) | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/probe-shape.spec.ts"` | No - Wave 0 |
| FOUND-10 | Redraw-gate structure and economy-purity scans hold across concatenated session sources | unit | `docker compose run --rm test npx vitest run tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts` | Yes (re-point in step 0) |
| FOUND-10 | No golden changed | process | `git diff --exit-code -- tests/golden` after each split step (plan verify step) | n/a |
| FOUND-10 | Frame phase order and event-router subscriber order pinned | unit | `... vitest run tests/app/session-order.test.ts` | No - Wave 0 (A1/A8) |
| FOUND-10 | Per-controller fake-context unit tests | unit | `... vitest run tests/app/session` | No - each split step |
| FOUND-11 | Ids monotonic, never reused, ascending iteration; kill/commit/spawn-this-tick semantics | unit + property | `... vitest run tests/sim/world/store.test.ts` | No - Wave 0 |
| FOUND-11 | Fixed id table and static/player views (ids 1-5, 100; statics not stored) | unit | `... vitest run tests/sim/world/view.test.ts` | No - Wave 0 |
| FOUND-11 | `hashWorld === hashFlight` on recorded flights incl. launch, dock, jump; pinned v1 values | unit/golden | `... vitest run tests/sim/world/hash.test.ts` | No - Wave 0 |
| FOUND-12 | `createSeededRandom` vectors unchanged; fork isolation; serialisable state | unit | `... vitest run tests/sim/rng.test.ts` | No - Wave 0 |
| FOUND-12 | Arrival goldens unchanged | unit | `... vitest run tests/sim/hyperspace-arrival.test.ts tests/persistence/autosave.test.ts` | Yes |
| FOUND-12 | Live vs restored world hash equal over 1,000 ticks (reversed insertion order, killed-highest-id, -0) | unit | `... vitest run tests/sim/world/snapshot.test.ts` | No - Wave 0 |
| FOUND-12 | Lint rejects `Math.random`, `Date`, wall clock, `for..in`, bare `.sort()` (+ positive controls) | guard | `... vitest run tests/guards/sim-determinism-bans.test.ts` | No - Wave 0 |
| FOUND-12 | Cadence: same world hash at 30/60/144 Hz including a launch and an arrival | unit | `... vitest run tests/sim/world/world-cadence.test.ts` | No - Wave 0 |
| FOUND-13 | Pilot via fake `WorldView` + recording `ShipControl`; JSON round trip; integer timers | unit | `... vitest run tests/sim/ai/test-pilot.test.ts` | No - Wave 0 |
| FOUND-13 | AI zone rejects simulation-internal imports (type and value, export-from, dynamic) | guard | `... vitest run tests/guards/ai-zone.test.ts` | No - Wave 0 |
| FOUND-14 | `parseTestFlags` and `advanceTicks` contract (bounds, first-step commands, taint, paused no-op) | unit | `... vitest run tests/app/session/test-flags.test.ts tests/app/session/sim-driver.test.ts` | No - Wave 0 |
| FOUND-14 | Browser `advanceTicks(N)` hash equals Node run of the same N; manual clock does not self-step; traffic off by default | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/tick-hook.spec.ts"` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** the targeted `vitest run <file>` for the files touched; split steps run `docker compose run --rm verify` (D-12).
- **Per wave merge:** `docker compose run --rm verify`; `verify-full` at split steps 3, 6, 9 and after the integration plan.
- **Phase gate:** local `docker compose run --rm verify-full` green (the D-01 baseline), with `git diff --exit-code -- tests/golden` clean, before `/gsd-verify-work`. Budget: at most one new browser spec per concern, each under about 60 s under `workers: 2`.

### Wave 0 Gaps
- [ ] Local `verify-full` baseline run, with duration recorded (D-01).
- [ ] `tests/e2e/probe-shape.spec.ts` plus shape fixtures, added to `test:e2e:fast`.
- [ ] `tests/helpers/session-source.ts`; `redraw-gate.test.ts` and `economy-purity.test.ts` re-pointed and made order-independent.
- [ ] Recorded v1 `hashFlight` pins (additive golden) and current-closure RNG vectors, captured **before** any `math.ts`/`flight` edit.
- [ ] `tests/sim/world/*`, `tests/sim/ai/*`, `tests/sim/rng.test.ts`, the two guard files, `tests/helpers/tick-script.ts`, `tests/e2e/tick-hook.spec.ts`.
- [ ] Framework install: none (all tools present).

## Security Domain

`security_enforcement` is enabled (absent = enabled; config shows `true`, ASVS level 1, block on high) [VERIFIED: .planning/config.json]. There is no authentication, session, or server surface; the relevant controls are input validation at the two new boundaries (URL flags and the hook argument; the snapshot JSON parser) and keeping the test seams narrow.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | static client, no accounts |
| V3 Session Management | no | no server sessions |
| V4 Access Control | no | no multi-user surface; the hook is gated by `?test=1`, taints the profile, and never writes saves |
| V5 Input Validation | yes | exact-value URL flag parsing (`"1"`, `"manual"`); `advanceTicks` integer/range check; strict `parseWorldSnapshot` (finite numbers, integer ticks, ascending unique ids, bounded counts, known enum values) |
| V6 Cryptography | no | FNV is an integrity checksum, not a security control (documented in `hash.ts`); no new crypto, and `crypto` is added to the sim globals ban |
| V12 Files / V14 Config | marginal | the shipped bundle includes the hook behind `?test=1`; the read-once rule and the absence of any save write keep it inert for players |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A shared link `?test=1&clock=manual` freezes a player's session | Denial of service (self-inflicted) | Flags only honoured with `test=1`; no persistence effect; documented as test-only |
| Oversized `advanceTicks` argument freezes the tab | Denial of service | Hard cap and safe-integer check; synchronous bounded loop |
| Hook mutation makes a durable save from hooked state | Tampering | Existing taint rule; `advanceTicks` taints; autosave skips a tainted profile |
| Malformed snapshot JSON reused by Phase 11 | Tampering | Boundary parser with typed failure; `MAX_ENTITIES` and size bounds now |
| A NaN entity throws inside the frame loop | DoS | `sanitizeEntity` before hash; never wrap the hash in try/catch |
| Unseeded randomness or wall clock sneaks into `src/sim` | Repudiation of determinism | Lint bans plus probe proofs with positive controls |

## Sources

### Primary (HIGH confidence)
- `/home/opencode/git/wegolite/src/app/game-session.ts` (read: header, options/interfaces, state `let` block 335-487, `frame` 2699-2864, `handleEvent` 2294-2410, `updateProbe` 2412-2550, `handleHyperspaceJumped` 2061-2158, `startSession` 2884-3250, `dispose` and return 3303-3364)
- `/home/opencode/git/wegolite/src/app/probe.ts`, `src/app/game-loop.ts`, `src/sim/{hash,step,time,loop,events,commands,math}.ts`, `src/sim/flight/{state,step}.ts`, `src/sim/world/layout.ts`, `src/sim/hyperspace/arrival.ts`, `src/sim/economy/{market,ranrot}.ts`
- `/home/opencode/git/wegolite/eslint.config.js`, `package.json`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.sim.json`, `compose.yaml`, `.prettierignore`
- `/home/opencode/git/wegolite/tests/{app/redraw-gate,guards/economy-purity,guards/sim-purity,guards/eslint-gate,guards/probe-lock,contract/fidelity,sim/flight-cadence,sim/replay-integrity,helpers/lave}.test|.ts`, `tests/e2e/helpers/{probe,chart}.ts`
- `.planning/research/{ARCHITECTURE,PITFALLS,STACK,SUMMARY}.md`, `.planning/ROADMAP.md` (Phase 8), `.planning/REQUIREMENTS.md` (FOUND-10..14), `.planning/STATE.md`, `.planning/PROJECT.md`, `08-CONTEXT.md`
- Oolite checkout `/home/opencode/git/oolite/src/Core`: `OOTypes.h:160-172`, `Universe.m:4841-4846, 5000-5032, 6430-6445, 6530-6545`, `Tables/OOBehaviour.tbl`, `Tables/OOScanClass.tbl`
- Container experiments (`docker compose run --rm lint node --input-type=module -`, scripts in the session scratchpad, not the repo): ESLint rule shapes and replace-not-merge semantics (outputs quoted in Pattern 8)

### Secondary (MEDIUM confidence)
- PITFALLS.md/ARCHITECTURE.md quantitative claims (about 121 e2e tests, about 1,366 unit tests, SwiftShader about 0.1x) carried as cited; the repo currently lists 25 spec files and about 118 `test(`/`it(` lines under `tests/e2e` by a rough count.

### Tertiary (LOW confidence)
- None used as authority.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; versions read from `package.json`.
- Architecture: HIGH — locked by CONTEXT plus ARCHITECTURE sections whose line ranges were re-verified against the current file.
- Pitfalls: HIGH — each was found in code or confirmed by experiment; the manual-clock autosave hazard and the order-sensitive scan tests are derived from reading `frame()` and the tests.

**Research date:** 2026-11-11
**Valid until:** about 30 days (the split target file changes whenever another phase edits `game-session.ts`; re-check the line ranges before step 1 if other work lands first).
