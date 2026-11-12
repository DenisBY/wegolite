# Phase 8: Session Split and World Core - Research

**Researched:** 2026-11-12 (forced refresh; supersedes the 2026-11-11 file)
**Domain:** Behaviour-preserving split of a 3,365-line TypeScript closure, plus a pure-TypeScript deterministic multi-entity world core (ids, store, seeded streams, hash, snapshot codec, AI seam), ESLint zone enforcement, and a Playwright tick-stepping test hook
**Confidence:** HIGH (nearly everything is first-party code and planning artefacts read this session; the ESLint zone behaviours were re-proven by a container experiment this session)

**Revision note (read first).** Re-derived from the current `08-CONTEXT.md`. What moved against the 2026-11-11 file: (1) D-06 was amended on 2026-11-12: entity ids are unique **per world**, each new world restarts dynamic ids at 101, and no id outlives its world; the new section "Per-world id scope" below carries the consequences (lifecycle, what may and may not hold an id, hash, snapshot, tests, forward hazards). (2) D-07 is now stated the way the plans implement it: the five static bodies are **world entities** (records in `world.statics`, ids 1-5, referencing `SystemLayout` by key, never hashed, never in the dynamic store). The old file's diagram said "not stored"; that wording is withdrawn. (3) D-02 stays `mix32` (already corrected on 2026-11-12). (4) Round 1-4 cross-AI review findings that shaped the 16 plans are folded in as constraints (limits file, `advanceTicks` always a function, enum validation at spawn, `worldSeed` uint32, exact-JSON restore comparison, delivery cap, Firefox run). (5) Every in-repo discrete value below was re-read this session and is quoted verbatim.

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
- **D-06:** Fixed ids: `0` = `NO_ENTITY`; `1` planet; `2` sun; `3` main station; `4` witchpoint buoy; `5` station navigation buoy; `6..99` reserved for future static bodies; `100` player (Oolite's player UID); dynamic entities (NPCs, pods, missiles, wreckage) from `101`, monotonic and never reused within the world that issued them. This supersedes ARCHITECTURE.md §5.1's draft `PLAYER_ID = 1`. — **Reversibility:** costly — ids appear in world hashes, golden fixtures and every AI/test reference; renumbering regenerates goldens.
  - **Owner amendment 2026-11-12 (id scope):** id uniqueness is per world. Within one world, dynamic ids are monotonic and never reused. `nextId` restarts at `101` for each new world: each launch, each hyperspace arrival, and each in-flight Continue or Load. No entity id may outlive the world that issued it, so nothing outside the world (saves, HUD, logs, mission state, targeting across a jump) stores or transports one. Rationale: a world stays a pure function of its seed (D-02), so the world hash, snapshots and browser/Vitest parity stay reproducible. ROADMAP Phase 8 success criterion 2 and REQUIREMENTS FOUND-11 carry the same scope ("within the world that issued it"). Oolite contrast: its `OOUniversalID` comes from a wrapping counter that reuses freed slots even within one system (`Universe.m:5016-5020`), so Wegolite is deliberately stricter within a world. Plans 08-05 (`createWorld`) and 08-15 (the world lifecycle) implement it; plan 08-05 records it as Key Decisions row (d).
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
- Persisting `epoch` and `nextEntityId` in the save: Phase 11 (SAVE-07, SAVE-08 stage 1). Reconciled with D-06 (amended 2026-11-12): the persisted `nextEntityId` is the issuing world's own counter, saved so that the same world regenerates at the leg anchor; it names no entity, so it does not carry an entity id across worlds.
- Out of scope (phase boundary): any NPC in play (Phase 12+), the populator (Phases 12 and 22), save schema v3 and persisting `epoch` (Phase 11, SAVE-07), collision (Phases 10, 13 and 15), chart-in-flight simulation (Phase 12), scenario spawning for combat specs (Phase 13+).
- Reviewed todos not folded: the Shift+C CI timeout todo (D-01: ignored for Phase 8), the three Phase 12 todos, the Phase 15 planet/sun collision todo, the cost-basis and palette todos.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-10 | Existing v1 play is unchanged after `src/app/game-session.ts` is split into subsystems: every v1 golden, unit and e2e test passes without regeneration, and the probe shape is unchanged | Patterns 1-3 (current structure, source-scan tests, probe-shape snapshot), Pitfalls 1-4, 12, 13 |
| FOUND-11 | The simulation holds many entities with stable ids, never reused within the world that issued them (each new world restarts its dynamic ids, and no entity id outlives its world; D-06 as amended 2026-11-12), canonical id-order iteration; with no NPCs present the world hash equals the v1 flight hash | "Per-world id scope", Patterns 4-5 (entity model and store, composed hash), Pitfalls 5-8 |
| FOUND-12 | All simulation randomness comes from serialisable seeded streams forked per entity and purpose; `src/sim` has no `Math.random`, `Date` or wall clock; live and restored worlds hash identically after 1,000 ticks | Patterns 6-8 (RNG and `mix32`, snapshot codec, lint bans), Pitfalls 8-10 |
| FOUND-13 | AI code reads the world only through a typed `WorldView` and acts only through a typed `ShipControl`; AI state is plain serialisable data with integer tick timers | Pattern 9 (seam, pilot, AI zone), Pitfall 5 |
| FOUND-14 | Tests can advance the simulation by N ticks through the test hook, and NPC traffic is off by default in browser tests and opt-in per spec | Pattern 10 (manual clock, flags, lifecycle, parity), Pitfalls 3, 11 |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

`./CLAUDE.md` and `./.claude/CLAUDE.md` do not exist at the repo root; the project guide is `AGENTS.md`, authoritative with the same weight as locked decisions. [VERIFIED: AGENTS.md read this session] Directives that bind this phase:

- **Everything runs in Docker.** A green host run is not evidence. Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>`, `docker compose run --rm e2e sh -lc "npm run build && npx playwright test <spec>"`, `docker compose run --rm e2e-cross` (Firefox, outside `verify`), `typecheck`, `lint`, `verify` (fast gate), `verify-full` (release gate; CI runs it).
- **`src/sim/` is pure TypeScript**: no Three.js, no DOM, fixed-timestep, deterministic, unit-testable. Rendering, input and UI are downstream through commands and events.
- **No database, no new server-side storage.** Saves stay in IndexedDB; Phase 8 does not touch the save schema.
- **Licensing/provenance:** no asset is added in this phase (no `NOTICE`/`ASSETS.md` change). **No OXP support.**
- **Documentation language:** English for `.planning/`, docs, commit messages and PR text.
- **Changelog:** user-visible changes under `## [Unreleased]` in the same commit; internal-only changes (tests, refactors, build tooling) may be omitted. This phase is internal-only.
- **Key Decisions:** record significant decisions in `.planning/PROJECT.md`.
- **Scratch files** live under `/tmp` (or the session scratchpad) and are mounted into the container; never add scratch files to the repo.
- **GSD workflow:** edits go through a GSD command; subagents get the reviewer/subagent brief block and the Oolite checkout path (`/home/opencode/git/oolite`); simple mechanical tasks go to the cheapest model tier, design/simulation/persistence/licensing stay on the main model.
- **Codebase memory:** use the codebase-memory index first; prefer `rg` over `grep`.
- Project skills read earlier: `principle-boundary-discipline` (validate at boundaries, trust internal types), `principle-test-behavior-not-implementation` (assert observable behaviour; derive expected values from the requirement, not from the code under test), `principle-type-system-discipline` (make illegal states unrepresentable, parse JSON at the boundary).

## Summary

Phase 8 is two independent tracks joined at one seam (D-14). The **split track** mechanically decomposes `src/app/game-session.ts` (3,365 lines, one closure) into `src/app/session/*` modules in ten bisectable commits, guarded by a probe-shape snapshot and by re-pointing the two tests that read the session file as text. The **core track** builds, in pure `src/sim`, a dense id-ordered entity store whose ids are never reused within a world, a serialisable mulberry32 stream with `mix32`-forked seeds, a composed world hash that is byte-identical to `hashFlight` while nothing has ever spawned, a strict snapshot codec, the read-only `WorldView` / write-only `ShipControl` seam, a scripted test pilot under `src/sim/ai/`, and ESLint rules that enforce all of it. One integration plan after split step 8 plugs `stepSim` into `sim-driver`, adds the **world lifecycle** (a brand-new world at every launch, arrival and in-flight Continue/Load; dropped at dock; `epoch` bumped at launch and arrival), the `?test=1&clock=manual` / `&traffic=1` flags, `advanceTicks`, and, in a final plan, one deliberate additive probe commit.

The amended D-06 makes the world a **pure function of `(worldSeed, ordered inputs)`**: because `nextId` restarts at 101 in every new world, a world has no memory of earlier worlds, and nothing may carry an id across the boundary. That is the property that keeps the world hash, snapshots and browser/Vitest parity reproducible, and it is cheap to honour in Phase 8 because no NPC exists yet. It becomes a live hazard from Phase 12 (scene maps keyed by id, queued events, HUD target) and is documented below as a standing rule.

The riskiest facts found in the code: (1) the two session-text scanning tests are order-sensitive (`toEqual` on an ordered two-element array of `renderFrame(` matches) and `switchCaseBody` picks the *first* `case "docked":` in the text it is given; (2) a later ESLint config block that sets the same rule key **replaces** the earlier block's options (re-proven this session), so the AI-zone block must restate what it needs; (3) `tests/guards/sim-purity.test.ts` source-scans `src/sim` for import specifiers containing `input` and for declared type names containing `Frame` (also in `src/app`); (4) the `?test=1` hook captures `FlightState` by identity (the G-8 bug class), so `advanceTicks` and the world must read live context fields, never captured ones; (5) FIDELITY.md pins `src/sim/hyperspace/arrival.ts:125` and `src/sim/flight/step.ts:218`, so those files stay byte-identical: re-implement `createSeededRandom` on top of the new RNG inside `math.ts`.

No external package is needed: everything uses the existing toolchain (TypeScript 6.0.2, Vitest 5.0.5, fast-check 4.10.2, ESLint 10.14.0, typescript-eslint 8.72.1, Playwright 1.64.1). The Package Legitimacy Gate is therefore not triggered.

**Primary recommendation:** Pin the safety nets first (verify-full baseline, probe-shape spec, session-source helper, recorded v1 flight-hash and RNG vectors), run the split (track A) and the core (track B) in parallel under the D-14 file ownership, and join them in one integration plan that only touches `sim-driver`, the world lifecycle, the flags and the single post-split probe update.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Entity ids, store, iteration order, hash, snapshot codec, RNG, AI seam types | `src/sim` (pure) | — | Determinism product; must run in Node with no DOM/Three (AGENTS.md Conventions) |
| Static-body entities (ids 1-5) | `src/sim` records in `world.statics` that reference `SystemLayout` by key | — | D-07: entities with fixed ids, `SystemLayout` stays the single authority; never hashed (D-08) |
| Player as entity id 100 | `src/sim` adapter over `FlightState` | — | Storage stays `FlightState`; uniform read interface only |
| Per-tick orchestration (`stepSim`) | `src/sim` | `src/app/session/sim-driver` calls it | `stepFlight` runs first, world after; the app only drives and routes events |
| World lifecycle (create at launch/arrival/Continue/Load, drop at dock, bump `epoch`) | `src/app/session` (world-lifecycle, hyperspace, event-router) | `src/sim` supplies `createWorld`/`worldSeedFor` | Lifecycle is session policy keyed on events; derivation is sim. Per-world id scope is enforced here by never reusing a `World` object |
| Manual clock, `advanceTicks`, traffic flag | `src/app/session` (test-flags, sim-driver) and the hook in `src/app/probe.ts` | — | URL flags are an app boundary; the sim never sees them |
| Lint bans and AI zone | `eslint.config.js` + `tests/guards/*` | — | Mechanical enforcement, proven by generated probes |
| Probe shape pin and tick-hook parity | Playwright (`tests/e2e`) | Vitest for the pure parts | Only a browser can read the real `window.__wegolite` |
| Split bookkeeping tests | Vitest (`tests/app`, `tests/helpers`) | — | Source-scan tests read text, no browser |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.2 | World model types; plain-alias `EntityId` | Project toolchain [VERIFIED: package.json] |
| Vitest | 5.0.5 | Unit/integration incl. world property tests | `npm test` is `"test": "vitest run --coverage"` [VERIFIED: package.json:17] |
| fast-check | 4.10.2 | Property tests for store invariants (unique ids per world, ascending order, snapshot round trip) | Already a devDependency [VERIFIED: package.json] |
| ESLint + typescript-eslint | 10.14.0 / 8.72.1 | Zone enforcement via core rules `no-restricted-imports/-globals/-properties/-syntax` | Existing mechanism; no plugin needed (Pattern 8, container-proven) [VERIFIED: package.json:35,42] |
| Playwright | 1.64.1 | Probe-shape spec and tick-hook spec | Project e2e toolchain [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/sim/hash.ts` (`fnv1a32`, `canon`) | in-repo | World hash text | Never `JSON.stringify` for hashed text |
| `tests/guards/eslint-gate.ts` (`lintProbe`) + `probe-lock.ts` (`withProbeLock`) | in-repo | Generated-probe lint proofs for the new bans | One guard test per ban and for the AI zone |
| `tests/helpers/lave.ts` (`laveFixture`) | in-repo | Real layout/config for world tests and Node-side expected hashes | Any test needing a `SystemLayout` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled store | bitecs / miniplex / koota | Rejected in STACK.md Decision 1: bitecs recycles ids, miniplex has no ids/serialisation, koota has no documented snapshot API [CITED: .planning/research/STACK.md "Decision 1: Entity store"] |
| `eslint-plugin-import` `no-restricted-paths` for the AI zone | core `no-restricted-imports` with a `regex` allow-list | A plugin adds a dependency and a Docker rebuild; the regex allow-list was proven this session |
| Branded `EntityId` | plain `number` alias | ARCHITECTURE §5.1 uses a plain alias; ids cross JSON and fixtures constantly. Use the alias plus `NO_ENTITY` |

**Installation:** none. No `package.json` dependency change, so no `docker compose down --volumes` for dependencies. (Plan 08-01 edits one `package.json` *script*, `test:e2e:fast`; that needs no volume reset.)

**Version verification:** versions read from `package.json` this session; the container reports Node `v24.22.2` [VERIFIED: `docker compose run --rm lint node --version` this session]. Nothing new is installed, so no registry query applies.

## Package Legitimacy Audit

This phase installs no external packages; `package-legitimacy check` was not run.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
            URL: ?test=1 [&clock=manual] [&traffic=1]     (parsed ONCE at boot by parseTestFlags)
                                   |
 keyboard/UI -> frame-loop (render always; probe.frames += 1)           window.__wegolite  <- probe-publisher
                   |                                                    (shape frozen until the ONE deliberate
        realtime:  |  manual clock: no GameLoop.advance,                 additive commit of plan 08-16)
        GameLoop.advance          advanceTicks(n) only                          ^
                   \                 /                                          |
                    +-> sim-driver.stepOnce(commands) -------------------------+  probe.sim {tick, epoch, entities, ...}
                            |
                            | 1. stepFlight(player, ...)                  [unchanged, owns FlightState]
                            | 2. world live? stepWorld(world, player,...) [id order, length snapshot, AI think, FIFO event drain]
                            | 3. SimEvent[] -> event-router (ordered subscribers)
                            v
        hudMessages, stationFlow, dockFeedback, hyperspaceFlow, worldLifecycle, autosave

 World lifecycle (session policy, one World object per world, never reused):
   launched event            -> epoch += 1; world = createWorld(worldSeedFor(marketSeed, epoch)); populate(world,{traffic})
   hyperspaceJumped install  -> epoch += 1; world = createWorld(worldSeedFor(newMarketSeed, epoch)); populate(...)
   in-flight Continue / Load -> world = createWorld(worldSeedFor(marketSeed, epoch)) [no bump]; populate(...)
   docked event / dispose    -> world = undefined          (hashWorld(player, undefined) === hashFlight(player))
   every createWorld starts its dynamic ids at 101 (D-06 as amended); no id crosses a boundary above

 World = { worldSeed, statics[5] (frozen records -> SystemLayout keys), store (ascending array, nextId), rng }
 hashWorld(player, world?) = fnv1a32( serializeFlight(player) + section ),  section = "" until anything ever spawned
```

### Recommended Project Structure
```
src/sim/
  rng.ts                  # RngState, rngNext, fmix32, mix32, worldSeedFor, forkSeed, purposes (core track)
  math.ts                 # createSeededRandom delegates to rngNext (same bit sequence; core track owns it)
  events.ts               # + reserved presentation/audio event types (core track)
  sim.ts                  # stepSim(player, world, ...) composes stepFlight + stepWorld
  world/
    ids.ts                # EntityId, NO_ENTITY, fixed ids, FIRST_DYNAMIC_ID, MAX_ENTITIES, closed vocabularies (no imports)
    limits.ts             # the ONE owner of shared numeric/string limits (review R4 item 4)
    entity.ts, store.ts, world.ts (createWorld, STATIC_ENTITIES, worldSeedFor re-export)
    view.ts, control.ts   # TYPES ONLY; the only world files AI code may import (with ids.ts)
    view-impl.ts, control-impl.ts
    serialize.ts          # serializeEntity, serializeWorldSection, entityHashes, hashWorld
    sanitize.ts, snapshot.ts, step.ts
  ai/                     # types.ts, time.ts, registry.ts, pilots/test-pilot.ts (D-11)
src/app/session/          # context, probe-publisher, render-driver, chart/settings/station/save/hyperspace controllers,
                          # event-router, sim-driver, step-options, frame-loop, start-session, test-flags, world-lifecycle
src/app/game-session.ts   # shrinks to the facade; createGameSession stays the only public export
tests/helpers/session-source.ts, tests/helpers/recorded-flights.ts, tests/helpers/tick-script.ts
tests/sim/world/, tests/sim/ai/, tests/sim/rng.test.ts, tests/guards/ (sim-determinism-bans, ai-zone),
tests/e2e/probe-shape.spec.ts, tests/e2e/tick-hook.spec.ts, tests/golden/world/flight-hash-pins.json
```
Avoid file names or import specifiers containing the substring `input` anywhere in `src/sim`, and avoid declaring type names containing `Frame` in `src/sim` or `src/app` (Pitfall 4).

### Pattern 1: The current session structure (what the split moves)
**What:** `createGameSession` is one closure of about 100 `let` fields and about 120 inner functions. Anchors re-read this session [VERIFIED: `rg '^  function ...' src/app/game-session.ts`]: `handleHyperspaceJumped` at 2061, `handleEvent` at 2294, `updateProbe` at 2412, `frame` at 2699, `performSwap` at 3265, `dispose` at 3303; file length 3365 lines. Line anchors go stale after every extraction: executors locate code by pattern, not line.
**Behaviour that must survive (read this session, `src/app/game-session.ts:2790-2864`):** one immutable frame per rendered frame, `const frameInput = currentInput.frame(); currentFrame = frameInput;` shared by every fixed step; the step callback is `alpha = currentLoop.advance(delta, commands, (stepCommands) => {` and re-reads `const liveState = state; const liveLayout = layout; const liveConfig = config;` per step (a jump can swap them mid-frame), returns early when any is `undefined`, sets `previousPose = currentPose`, picks `const controller = liveState.mode === "launching" ? scripted : player;`, derives `equipmentSet()`, `targetSystem()` and `witchspaceStationMass(system.station)`, builds `StepOptions` (`dock: dockGeometry` only when defined), calls `stepFlight(liveState, liveLayout, liveConfig, intent, stepCommands, DT, stepOptions)`, runs `handleEvent(event)` per event, then `launchSequence.advance(DT, liveState.mode === "inFlight")` only when `modeBefore === "launching"`, then `currentPose = poseOf(liveState);`. The paused branch drains `currentInput.drainCommands(); pending.length = 0;` and zeroes `currentFrame`, and the frame ends with `renderFrame(alpha, shouldDraw());`.
**Hook binding (G-8):** the test-flag line is `testHookEnabled =\n      new URLSearchParams(window.location.search).get("test") === "1";` followed by `if (testHookEnabled) bindTestHook(flightState);` [VERIFIED: src/app/game-session.ts:3184-3186]; `bindTestHook(activeState: FlightState)` is at 1034 and is re-called after an in-session Load at 1418 (`if (testHookEnabled) bindTestHook(restored.state);`). New hook methods must read live context fields, never a captured `FlightState`.
**Single install block:** `handleHyperspaceJumped` (2061-2158) is the synchronous install on a jump; world teardown/creation and the `epoch` bump join it and must not throw inside it.
**When to use:** follow ARCHITECTURE §4.1 module table and §4.2 order exactly (D-12). Each step: one commit, `docker compose run --rm verify` green; `verify-full` at steps 3, 6, 9.

### Pattern 2: Step 0 and the source-scan tests
**What:** two tests read the session as text.
- `tests/app/redraw-gate.test.ts:113-155` [VERIFIED, read this session]: `const source = readFileSync("src/app/game-session.ts", "utf8");` then exactly one `renderFrame(alpha, shouldDraw())`, and
  `expect(gated).toEqual([\n      "renderFrame(alpha: number, draw = true)",\n      "renderFrame(alpha, shouldDraw()",\n    ]);` (an **ordered** pair), the string `redrawGate.next(paused || state?.mode === "docked", drawKeys())`, `return [state, scene, scene?.nebulae?.revision() ?? 0];`, `source.match(/redrawGate\.request\(\);/g)).toHaveLength(5)`, `probe.frames += 1;` and `probe.renders = renderer.info.render.frame;`.
- `tests/guards/economy-purity.test.ts:201-207` [VERIFIED]: `switchCaseBody` uses `source.search(new RegExp(\`case\\s+"${name}"\\s*:\`))`, i.e. the **first** match; `:311-353` read `src/app/game-session.ts` for the two-field profile literal and `generateMarket` producers (`toHaveLength(3)`), then `const docked = switchCaseBody(session, "docked");`.
**Implication for `tests/helpers/session-source.ts`:** concatenate `game-session.ts` plus `src/app/session/**/*.ts` in a deterministic comparator order (a comparator is fine in tests). After the split the `renderFrame(alpha: number, draw = true)` declaration (render-driver) and the gated call (frame-loop) concatenate in alphabetical order frame-loop then render-driver, which reverses the pair; make the assertion order-independent. `case "docked":` exists once today (`src/app/game-session.ts:2321`) [VERIFIED: `rg 'case "docked":' src/app`] and must stay once across the concatenation (in the event-router's station-flow subscriber), or `switchCaseBody` may scan the wrong body. The helper must fail loudly on zero session sources (vacuity guard). Step 0 must be green against the unmodified monolith.

### Pattern 3: Probe-shape snapshot (before step 1) and the post-split deliberate commit
**What:** a Playwright spec `tests/e2e/probe-shape.spec.ts` serialises the recursive shape of `window.__wegolite` (sorted keys, `typeof` per leaf, `null` distinct, arrays as the sorted set of element shapes, `probe.test` members as `"function"`) at menu, docked, in-flight, paused, chart-open and after a save; fixtures are committed JSON; waits use `probe.frames` increments, never wall time (PITFALLS 11). Volatile optional keys (`hint`, `restore`, `dust`, `world`, `shipVisible`) are sampled at deterministic points or allow-listed, but the spec must still fail on any added, removed or renamed key.
**Fast-gate membership:** `verify` runs `"test:e2e:fast": "playwright test --project=chromium tests/e2e/scene.spec.ts tests/e2e/docking.spec.ts tests/e2e/save-load.spec.ts"` [VERIFIED: package.json:20]; the step-0 plan adds `tests/e2e/probe-shape.spec.ts` to it, paired with `tests/contract/container-contract.test.ts` (plan 08-01).
**Post-split deliberate commit (plan 08-16 only):** add `probe.sim` (cheap integers/booleans: `tick`, `epoch`, `entities` count, `traffic`, `clock`) and hook members `advanceTicks` and `worldHash` **as always-present functions** (R4 consensus 3: `advanceTicks` refuses outside the manual clock but is never `undefined`, so 08-01's "every `probe.test` member reads `function`" contract survives). Update the shape fixture in that same commit. Never compute the hash per frame (28 KB of text at 40 ships, ARCHITECTURE §16 [CITED: .planning/research/ARCHITECTURE.md]). The additive-only rule is machine-checked by a subtractive diff of the fixture.

### Pattern 4: Entity model and store (ids per D-06)
**What (ARCHITECTURE §5 adapted to the locked ids):**
```ts
export type EntityId = number;                  // plain alias
export const NO_ENTITY = 0;
export const PLANET_ID = 1; export const SUN_ID = 2; export const MAIN_STATION_ID = 3;
export const WITCHPOINT_BUOY_ID = 4; export const STATION_NAV_BUOY_ID = 5;
export const PLAYER_ID = 100;                   // supersedes ARCHITECTURE §5.1's PLAYER_ID = 1 (D-06)
export const FIRST_DYNAMIC_ID = 101;            // every NEW WORLD restarts here (D-06 amended 2026-11-12)
export const MAX_ENTITIES = 256;                // dynamic entities only
```
- **Store** = a dense array strictly ascending by id (a spawn appends the next id) with a stored `nextId` that only increases within its world; lookups by binary search over the ascending array (plan 08-05), so no `Map`/`Set` whose iteration order could decide anything exists. `kill` marks dead, `commit()` compacts in place and returns removed ids ascending; `live` includes entities spawned this tick; `get(id)` is `undefined` for a missing, dead or static id; a failed spawn (cap, `nextId` overflow, validation refusal) allocates no id and does not advance `nextId`.
- **Update passes** capture `const n = store.live.length` first and iterate `0..n-1`; entities spawned this tick are first updated next tick (ARCHITECTURE §5.3). Oolite retains a copy for the same reason [VERIFIED: /home/opencode/git/oolite/src/Core/Universe.m:6430-6440, `// use a retained copy so this can't be changed under us.`].
- **Oolite id facts (quoted):** `typedef uint16_t OOUniversalID; // Valid IDs range from 100 to 1000.` with `UNIVERSE_MAX_ENTITIES = 2048, NO_TARGET = 0, MIN_ENTITY_UID = 100, MAX_ENTITY_UID = MIN_ENTITY_UID + UNIVERSE_MAX_ENTITIES + 1` [VERIFIED: oolite/src/Core/OOTypes.h:165-172]; `if (u_id == 100) return PLAYER; // the player` [VERIFIED: Universe.m:4841-4844]; allocation is `while (entity_for_uid[next_universal_id] != nil) // skip allocated numbers` with `if (next_universal_id >= MAX_ENTITY_UID) { next_universal_id = MIN_ENTITY_UID; }` [VERIFIED: Universe.m:5016-5020], so a wrapped counter reuses freed slots even within one system. The monotonic per-world counter is the deliberate stricter divergence; record it in PROJECT.md Key Decisions (plan 08-05 row (d)). ARCHITECTURE §5 already says `Allocation is a saved counter, nextId++, never reused within a world` [VERIFIED: .planning/research/ARCHITECTURE.md:207]; D-06's amendment aligns the decision with that wording and removes the later reading "never reused, ever".
- **Statics (D-07):** each world carries `world.statics`, five frozen records `{ id, kind, scanClass, layoutKey }` in ascending id (1 planet / layoutKey `planet`, 2 sun / `sun`, 3 station / `station`, 4 witchpoint buoy / `witchpoint`, 5 nav buoy / `navBuoy`), never copying geometry. `SystemLayout` fields: `readonly planet: Body; readonly sun: Body; readonly station: Body; readonly navBuoy: Body; readonly witchpoint: Body;` with `interface Body { readonly position: Vec3; readonly radius: number; }` [VERIFIED: src/sim/world/layout.ts:42-52]. `WorldView.body(id)` resolves a static record through the layout; the station's pose applies `FlightState.stationAngle` ("Radians the station has rolled about its local +Z", [VERIFIED: src/sim/flight/state.ts:58-59]) on top of `layout.stationBaseQuat`. Player id 100 is an adapter over `FlightState` (`position`, `orientation`, scalar `speed`, `impulse`). Statics never enter the dynamic store, the cap, or the hash.
- **Reserved ids 6..99** are never allocated: dynamic allocation starts at `FIRST_DYNAMIC_ID`.

### Pattern 5: World hash composed so an empty world equals `hashFlight` (D-08)
**What:** `serializeFlight` ends with `` `repairCount=${canon(state.repairCount, 0)}`, `` followed by `].join("\n");` and `hashFlight(state)` is `return fnv1a32(serializeFlight(state));` [VERIFIED: src/sim/flight/state.ts:177-183]. Compose, never extend: `hashWorld(player, world) = fnv1a32(serializeFlight(player) + section)`, where `section === ""` when the world is absent **or has never spawned anything**, otherwise `"\n" + section`.
- "Never spawned" is one exported predicate `isNeverSpawned(world)` (plan 08-05): the store's `nextId` is still `FIRST_DYNAMIC_ID`, its live array is empty, **and** `world.rng.s` equals the initial `forkSeed(worldSeed, NO_ENTITY, "world")` state, so any world-stream draw or spawn flips it. While it holds, no `worldSeed=`, `nextId=`, `rng=` line, no statics and no `epoch` appear: this is what keeps D-08 across every launch and arrival bump. Once it is false the section begins with `worldSeed=<uint32>`, `nextId=<int>`, `rng=<uint32>` then one line per live non-dead dynamic entity in ascending id (position/orientation via `canon`, integer ticks via `canon(n, 0)`, every RNG stream state, AI component with params in comparator-sorted key order and type-tagged values, repair count).
- Because `worldSeed` and `nextId` are in the section once anything spawned, two *different* worlds that both issue id 101 cannot hash equal by accident (per-world id scope): the id alone never identifies an entity across worlds, the pair (worldSeed, id) does.
- Expose `entityHashes(world): readonly [EntityId, string][]` so a failing test names the first diverging id.
- `canon` is `export function canon(n: number, digits = 6): string {` with `if (!Number.isFinite(n)) { throw new Error(\`non-finite value in state: ${String(n)}\`); }` and `return (r === 0 ? 0 : r).toFixed(digits);` [VERIFIED: src/sim/hash.ts:29-35]. A NaN entity therefore crashes the frame loop: a per-tick `sanitizeEntity` runs before any hash (Pitfall 9). `canon(.., 6)` rounds to 1e-6, so a hash comparison is a *rounded* comparison: the restore proof also compares `JSON.stringify(snapshotWorld(world))` exactly (R4 item 10).
- No pinned flight-hash constants exist today (the cadence tests assert equality across cadences only; `rg hashFlight tests` hits `tests/sim/{flight-controller,replay-integrity,hyperspace,flight-cadence,dock-cadence}.test.ts`; goldens are `tests/golden/{content,hyperspace,market,save}` and `kinematic-probe.json`). Record `hashFlight` values from the **unmodified** tree in Wave 0 into a new additive golden `tests/golden/world/flight-hash-pins.json` (plan 08-02) and assert both `hashFlight` and `hashWorld(player, world)` equal them on three recorded flights (a cadence script, a dock approach, a hyperspace jump) including a launch and an arrival bump.

### Pattern 6: Serialisable RNG, `mix32` seeds and forked streams (FOUND-12, D-02, D-04)
**What:** `createSeededRandom` is mulberry32 with state in a closure [VERIFIED: src/sim/math.ts:227-236]:
```ts
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
```
Implement `createSeededRandom(seed)` as a thin wrapper over `rngNext` inside `math.ts` (core track owns `math.ts`) so `drawWitchpointExit` keeps its exact draw order with **zero edits to `arrival.ts`**: the only sim-side user is `const next = createSeededRandom(seed);` at `src/sim/hyperspace/arrival.ts:73` [VERIFIED]; render callers (`src/render/bodies/{nebulae,dust,starfield}.ts`) keep the closure API [VERIFIED: rg]. FIDELITY.md pins `src/sim/hyperspace/arrival.ts:125` and `src/sim/flight/step.ts:218` [VERIFIED: FIDELITY.md:19,37], so leave both files byte-identical.
- Pin the algorithm with literal vectors captured from the **current** closure before any edit (plan 08-02); `tests/golden/hyperspace/routes.json` and the existing arrival tests give a second proof.
- **Seed derivation (D-02, one-way after Phase 11):** `worldSeedFor(marketSeed, epoch) = mix32(marketSeed, epoch)` with integer-only arithmetic in `src/sim/rng.ts`: `fmix32` (the MurmurHash3 finaliser), `mix32(a, b) = fmix32((a >>> 0) ^ fmix32((b + 0x9e3779b9) >>> 0))`, `forkSeed(worldSeed, entityId, purpose) = mix32(mix32(worldSeed, entityId), RNG_PURPOSE_CODES[purpose])` with a closed `purpose` union and fixed codes world 1, ai 2, combat 3 (plan 08-02, option-a; the owner confirms at its Task 2 checkpoint, which offers only mix32 forms; a string-FNV derivation would be a revision of the settled D-02 through /gsd-discuss-phase 8). `marketSeedForSystem` stays the producer of the uint32 `marketSeed` input only: `Number.parseInt(fnv1a32(\`${systemId}:0\`), 16) >>> 0` [CITED: src/sim/economy/market.ts:41-43, read in the prior session]. **Pin `fmix32`, `mix32`, `worldSeedFor` and `forkSeed` with literal vectors the moment they exist: the exact arithmetic is the contract.** `worldSeed` must be a uint32 integer (validated at `createWorld` and in `parseWorldSnapshot`, R4 item 7).
- **Per-world id scope and streams:** because ids restart at 101 per world, `forkSeed(worldSeed, entityId, purpose)` yields different streams for "id 101" in different worlds only because `worldSeed` differs (it changes with every `epoch`). Two worlds with the same `(marketSeed, epoch)` are *the same world* and correctly give identical draws for id 101; that is the point of D-02 ("reloading a save and launching reproduces the same world").
- Per-entity state: a fixed-shape record per `RngPurpose`, iterated through a closed `const` array, never `Object.keys`; every state a uint32 stored in the entity, hashed and snapshotted. The world-level stream is forked as `(worldSeed, 0, "world")`.
- Tests: spawning/killing entity B leaves entity A's draw sequence unchanged; the same `(worldSeed, id, purpose)` reproduces; two purposes differ; adjacent ids and 1,000 consecutive epochs give distinct seeds.

### Pattern 7: Snapshot codec and the 1,000-tick equality (FOUND-12 criterion 3)
**What:** `snapshotWorld(world)` returns plain JSON-safe data (`worldSeed`, `nextId`, world stream state, dynamic entities ascending with components, RNG states, AI component; **not** statics, which are a frozen constant, and **not** the player); `restoreWorld(snapshot)` rebuilds the same world; `parseWorldSnapshot(unknown)` validates at the boundary (principle-boundary-discipline) and throws a typed `SnapshotError`: ids unique, strictly ascending and `>= FIRST_DYNAMIC_ID`, `nextId > maxId`, count `<= MAX_ENTITIES`, `worldSeed` a uint32 integer, all numbers finite and within the shared limits, tick timers integers, RNG states uint32, known `specKey`/`aiKey`/`BehaviourId`/`scanClass`/`kind` values, quaternions unit within tolerance. It is test-only this phase; Phase 11 reuses it, so failures are typed.
- **Per-world scope:** a snapshot is the state of **one world**; `nextId` in it is that world's own counter (the Phase 11 reconciliation in CONTEXT Deferred). Restoring never "continues" an earlier world's numbering into a different world; a restored world and its live twin hold the same ids because they are the same world.
- Equality test shape: a scenario with entities spawned and killed so id gaps exist and `nextId` exceeds the live count; run to tick k live, `JSON.stringify` the snapshot, `JSON.parse`, restore, then run both to tick 1,000 comparing `hashWorld` every 50-100 ticks **and** `JSON.stringify(snapshotWorld(...))` exactly at each checkpoint. Include a restore into a store built in a different insertion order, a killed-highest-id case (the id must not return after restore: `nextId` is stored, never recomputed as `max+1`), and a `-0` case.
- JSON cannot carry `-0`, `NaN` or `Infinity` (`-0` becomes `0`; the others become `null`). `snapshotWorld` itself refuses non-finite numbers before serialising (R4 item 1: a NaN scalar param and a legal `null` param are identical after `JSON.parse`, so a "reject after JSON" test row cannot pass for scalars; keep that row for NaN inside param arrays only, and give the fast-check generator `null` and `boolean` params). `sanitizeEntity` normalises `-0` to `0` each tick. [ASSUMED: the `-0` divergence risk is low in Phase 8 because no steering is ported yet; the guard is cheap.]
- Quaternion discipline (R4 item 6): spawn requires unit quaternions; sanitize treats a norm below a threshold as degenerate (reset to identity) and re-checks after normalising, so "every sanitized world parses" holds.

### Pattern 8: Lint bans and the AI zone (container-proven this session)
**Existing zone** [VERIFIED: eslint.config.js:67-153]: `files: ["src/sim/**/*.ts"]` sets `no-restricted-imports` (three, settings, content catalogue, render/ui/input/app/persistence and the content loaders), `no-restricted-globals` over `DOM_GLOBALS` (lines 15-31: `window`, `document`, `navigator`, `localStorage`, `sessionStorage`, `indexedDB`, `HTMLElement`, `HTMLCanvasElement`, `CanvasRenderingContext2D`, `WebGLRenderingContext`, `requestAnimationFrame`, `cancelAnimationFrame`, `performance`, `Image`, `fetch`), `no-restricted-properties` (`Math.random`, `Date.now`, `performance.now`) and `no-restricted-syntax` with only `{ selector: 'NewExpression[callee.name="Date"]', message: "No Date inside src/sim." }`. Nothing bans `for..in`, bare `.sort()`/`.toSorted()`, `Date.UTC`/`Date()`, timers, `process` or `crypto` today. The generator zone (lines 154-243) already adds `localeCompare`, `toFixed`, `toPrecision`, `Intl`, `no-eval`, `no-new-func`.
**Current violations to expect: none.** [VERIFIED: `rg` over `src/sim` for `\bDate\b`, `for (... in`, bare `.sort()`/`.toSorted()`, timers, `process`, `crypto` finds only a comment in `hash.ts:8` and a comparator-bearing `[...commodities].sort(` at `economy/market.ts:169`.]
**Experiment re-run this session (container, ESLint 10.14.0 + typescript-eslint, config mirroring the real rule shapes; script kept in the session scratchpad, not in the repo; output verbatim):**
```
sim/a.ts => no-restricted-syntax:no for..in
sim/b.ts => no-restricted-syntax:bare sort
sim/c.ts => no-restricted-globals:Unexpected use of 'Date'. | no-restricted-syntax:No Date. | no-restricted-globals:Unexpected use of 'Date'.
sim/ai/d.ts => no-restricted-imports:'../flight/state.js' import is restricted from being used by a pattern. AI allow-list | no-restricted-syntax:no for..in
sim/ai/e.ts => clean            (import type from ../world/view.js and import from ../math.js)
sim/ai/f.ts => no-restricted-syntax:no dynamic import | no-restricted-syntax:no dynamic import
sim/ai/g.ts => no-restricted-imports:'three' import is restricted from being used by a pattern. AI allow-list
```
Reading: (a) `ForInStatement` and the argument-less `sort` selector work; (b) a regex allow-list in `no-restricted-imports` rejects value and type-only imports of simulation internals and bare packages; (c) dynamic `import()` needs an `ImportExpression` selector; (d) the later AI block **replaced** the sim block's `no-restricted-imports`: the sim block's "three ban" message was not reported for `sim/ai/g.ts`, only the allow-list message. Because the same replace-not-merge applies to `no-restricted-syntax` and `-globals`, the AI block must restate the sim bans.
**Rules to add (core track owns `eslint.config.js`):**
1. `src/sim/**/*.ts`: `no-restricted-syntax` gains `ForInStatement`, `CallExpression[callee.property.name="sort"][arguments.length=0]` and the same for `toSorted`; `no-restricted-globals` gains `Date` (covers `Date.UTC`, `Date()`), plus `setTimeout`, `setInterval`, `setImmediate`, `process`, `crypto`; add `no-eval` and `no-new-func` as in the generator zone (R4 item 9). `Math.sin/cos/acos` are used in `math.ts` and stay **unbanned** (PITFALLS 4: keep the hash claim narrow to "within one engine"). Known gap: `const m = Math; m.random()` passes; an optional extra selector can close it.
2. AI zone: `files: ["src/sim/ai/*.ts"]` and `["src/sim/ai/pilots/*.ts"]` (a regex cannot know the importing file's depth), each with one `patterns: [{ regex, message }]` allow-list: `./` siblings, `../` AI siblings for pilots, and exactly `math`, `world/ids`, `world/view`, `world/control` of the sim root; use `importNames` so the AI zone cannot import `createSeededRandom` from `math` under an alias (R4 item 9: AI randomness comes only from its forked stream). Add `ImportExpression` and repeat the sim syntax bans.
3. Factor the shared pattern list and syntax selectors into `const` arrays at the top (`SIM_IMPORT_PATTERNS`, `SIM_SYNTAX_BANS`) and spread them into both blocks.
**Proofs:** one guard file per concern (`tests/guards/sim-determinism-bans.test.ts`, `tests/guards/ai-zone.test.ts`) using the existing `lintProbe`/`withProbeLock` pattern (probe under `src/sim/...`, lint through the real config, assert, delete in `finally`), with a **positive control** per rule. The real `src/sim/ai/pilots/test-pilot.ts` is the live proof that a conforming module lints clean.

### Pattern 9: The AI seam and the test pilot (FOUND-13)
- `WorldView` (types only): `tick`, `playerId`, `isValid(id)`, `ship(id)`, `body(id)` for statics and the player, `scan(self, range, filter?)` returning ids ordered by `(distanceSquared, id)` with an explicit comparator, `mainStation()`, `mainPlanet()`, `sun()`, `nearestStation(self)`, `countWithRole(role)`. Add methods only when needed (Pitfall 19); return fresh plain objects with copied vectors so no live reference leaks.
- `ShipControl` (types only): id-addressed signatures kept from ARCHITECTURE §7.3 for the writes the pilot needs (`setTarget`, `setDestination`, `setDesiredRange`, `setDesiredSpeed`, `perform(BehaviourId)`, `scheduleWake`); `fireMissile`, `fireECM`, `launchPod`, `dumpCargo`, `setBounty`, `say` are omitted until a later phase. `createShipControl(world, actorId, tick)` makes a call whose `id !== actorId` a no-op, so "handlers mutate only the receiving entity" (Pitfall 7) is structural; writes outside the shared limits are clamped or refused at the seam (R4 item 12).
- **Ids inside the seam are world-scoped:** an `EntityId` returned by `scan` or stored by `setTarget` is valid only for the world that issued it. `isValid(id)` answers for the current world only. A pilot never persists an id beyond its own world (its `AiComponent` lives inside that world's snapshot).
- `BehaviourId`: a closed string union mirroring `OOBehaviour.tbl`; `rg -c ENTRY` over it reports 39 [VERIFIED: /home/opencode/git/oolite/src/Core/Tables/OOBehaviour.tbl]. `ScanClass` mirrors `OOScanClass.tbl`; 16 lines match `ENTRY` [VERIFIED: Tables/OOScanClass.tbl]. Declare both unions now (cheap, closed); `kind`, `scanClass`, `nav.behaviour` and `ai.aiKey` are validated at `spawnEntity` and repaired or killed by `sanitizeEntity`; AI dispatch goes through `Object.hasOwn(registry, aiKey)` so an `aiKey` of `"constructor"` cannot throw inside the fixed step (R4 item 5).
- Timers are absolute integer ticks compared with `view.tick` (the player's `FlightState.tick`, incremented once per `stepFlight` in every mode: `state.tick += 1;` at `src/sim/flight/step.ts:347`, `return events;` at :350 [VERIFIED]). One `ticks(seconds)` helper owns seconds-to-ticks (`Math.max(1, Math.round(seconds * 120))`); the legacy AI think interval is 15 ticks [CITED: ARCHITECTURE §7.1].
- Test pilot (`src/sim/ai/pilots/test-pilot.ts`): a small state machine (for example `seek -> hold`) reading `view.scan`, writing through `ctl`, drawing reconsider jitter from the per-entity `"ai"` stream, scheduling wakes in integer ticks. Proofs: JSON round trip of `AiComponent` deep-equal with identical subsequent behaviour; every timer an integer after every think; a recording `ShipControl` plus a fake `WorldView` make it a pure function; adding another entity does not change its draws; lint rejects an AI probe importing `../flight/state.js`.
- `stepWorld` dispatches through `AI_REGISTRY` in `src/sim/ai/registry.ts`; `world/step.ts` imports the registry; AI files import only seam types and constants (no cycle). Queued cross-entity events are drained FIFO with a cap on **total deliveries per tick**, not only on passes (R4 item 11: fan-out grows as `N·f^8`).
- Placeholder motion: a 1,000-tick equality is only meaningful if state evolves, so W1 applies a clearly labelled constant-speed integrator (`position += forward * speed * DT`) replaced by the Oolite thrust/attitude port in Phases 12-13 (plan 08-11, Key Decisions row (d) there).

### Pattern 10: Manual clock, `advanceTicks`, traffic flag, lifecycle and parity (FOUND-14)
- **Flags:** a pure `parseTestFlags(search)` returning `{ hook, manualClock, traffic }` (new `src/app/session/test-flags.ts`): `hook` iff `test === "1"` exactly (the existing rule), `manualClock` iff `hook && clock === "manual"`, `traffic` iff `hook && traffic === "1"`; unknown values are false; read once at boot next to the existing `testHookEnabled` line.
- **Manual-clock frame:** `frame()` keeps rendering and the probe update but never calls `GameLoop.advance` and never drains the keyboard queue; it uses alpha `1`. `advanceTicks(n)` owns the drain, launch filter, pre-launch autosave decision and hyperspace edge mapping once, then runs the same `stepOnce(commands)` n times with commands on the **first step only** and one shared input frame. `GameLoop` (`src/app/game-loop.ts`, `while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME)` [VERIFIED: game-loop.ts:45]) and `src/sim/loop.ts` stay untouched.
- **`advanceTicks(n)` contract** (plan 08-14): an always-present hook function; it refuses (returns the unchanged tick, no step, no taint) unless the manual clock is on, for a non-integer `n`, `n < 1`, `n > MAX_ADVANCE_TICKS` (200,000), when disposed, paused, a chart or save screen is open, or no state; otherwise it taints the profile **first** (so every autosave inside or after the call skips), steps exactly `n` ticks, stops early if a step pauses/disposes or opens an overlay, returns the live tick, and does not catch step exceptions (test-only hook, documented).
- **`worldHash()`:** an always-present hook function returning `hashWorld(player, world)` (a string; `hashFlight` returns a hex string), computed on demand from live context fields. `probe.sim.tick` publishes `state.tick` each frame.
- **Traffic:** `populate(world, { traffic })` is an injected seam called at every world creation (launch, arrival, Continue/Load) in **both** modes; in Phase 8 it adds nothing, so after every populate `liveEntityCount(world) === 0` and `world.store.nextId === 101`. `epoch` and the fresh-world `nextId` sequences are identical with traffic on and off (D-05); the browser spec asserts `probe.sim.traffic` and `probe.sim.entities === 0` by default.
- **World lifecycle (plan 08-15):** see the diagram: new `World` at `launched` (bump), at the arrival install block (bump), at in-flight Continue/Load (no bump; Open Question 2); dropped at `docked` and on dispose. The world never holds the `FlightState` reference: the live player is passed into `stepWorld`/`createWorldView` per call (G-8).
- **Browser/Vitest parity (criterion 5):** the scripted tick plan (new game, queue `launch`, `advanceTicks(1)`, then `advanceTicks(K)`) lives in one shared helper (`tests/helpers/tick-script.ts`) executed by a Vitest test and the Playwright spec against pure `src/sim`; the Node replay must use the same `StepOptions` as the browser, so `sim-driver` builds options through one pure exported `step-options.ts`. **Scope honesty:** with no populator the browser world is empty, so `hashWorld === hashFlight` there; browser parity proves tick control and option parity, while non-empty-world determinism is proven in Vitest (criterion 3). That is an inherent Phase 8 limit, not a gap to close here.

### Pattern 11: Plan decomposition (already fixed: 16 plans in 9 waves)
Wave 1: 08-01 safety nets (verify-full baseline, probe-shape, session-source), 08-02 RNG/pins/`mix32`, 08-03 lint bans. Wave 2: 08-04 split steps 1-2, 08-05 world foundation. Wave 3: 08-06 split 3-4, 08-07 seam. Wave 4: 08-08 split 5-6, 08-09 AI types/pilot/zone. Wave 5: 08-10 split 7-8, 08-11 world step. Wave 6: 08-12 split 9, 08-13 snapshot codec. Wave 7: 08-14 flags + manual clock. Wave 8: 08-15 integration. Wave 9: 08-16 probe commit + parity [CITED: ROADMAP.md Phase 8 plan list]. Research constraint for the planner: keep this wave graph; the review rounds found no wave-ordering, file-ownership or import-cycle defect.

### Anti-Patterns to Avoid
- **Editing `arrival.ts` or `flight/step.ts`** to use the new RNG/world; they carry FIDELITY pins.
- **Capturing `state`/`layout`/`scene` in a module-level variable** of an extracted controller (G-8, `drawKeys()` identity compares).
- **A module-level id counter, a `World` object reused across launches, or any registry that survives a world change** (breaks per-world scope and the pure-function-of-seed property).
- **Putting the world, epoch, seed or statics into `serializeFlight`/`hashFlight`** (invalidates the cadence/dock/hyperspace tests at once, PITFALLS 9).
- **Iterating a `Map`/`Set`/object for any sim decision**, bare `.sort()`, `for..in`, `Math.random`, `Date`.
- **One shared RNG stream**, or streams keyed by array index instead of id.
- **A per-frame `worldHash` in the probe.**
- **A `toEqual` on an ordered concatenation** in the re-pointed scan tests.
- **Regenerating any existing golden** (`tests/golden/**`) to make the split pass.

## Per-world id scope (D-06 as amended 2026-11-12)

The one new design topic of this refresh. The rule: ids are unique and never reused **within** the world that issued them; **every new world restarts dynamic ids at 101**; **no id outlives its world.**

**World boundaries (when a new `World` exists):** each launch, each hyperspace arrival, each in-flight Continue, each in-session Load. The world is dropped at dock and on dispose. `createWorld(worldSeed)` always builds an empty store at `FIRST_DYNAMIC_ID`; there is no module-level counter that could carry ids across worlds (plan 08-05 asserts this; plan 08-15 constructs a fresh `World` at every boundary and never resets an old one).

**What may hold an `EntityId`, and for how long:**

| Holder | Allowed? | Lifetime / rule |
|--------|----------|-----------------|
| Entity fields and `AiComponent` (`target`, `destination`) inside the world | yes | die with the world; included in that world's snapshot |
| `SimEvent` payloads (reserved audio/presentation types naming a shooter, target, cargo) | yes, **same tick** | consumed synchronously by the event router in the tick that produced them; the lifecycle teardown must discard any queued world events (the AI event queue lives in the world, so it dies with it) |
| `WorldView` / `ShipControl` return values | yes, within one think | never cached by AI across worlds |
| Snapshot JSON (test-only now, Phase 11 later) | yes, for that one world | the persisted `nextId` is the issuing world's own counter, not a transportable id (CONTEXT Deferred) |
| Save file (IndexedDB), HUD state, probe, logs, mission state, chart, profile, targeting across a jump | **no** | `probe.sim.entities` is a **count**; `FlightState` holds no entity id today (`hyperspaceTarget.id` is a chart *system id string*, and `compassTarget` is the union `"planet" \| "station" \| "witchpoint"`) [VERIFIED: src/sim/flight/state.ts:20,29-36,57] |
| Render/audio-side maps keyed by id (future scene entity registry, emitters) | **no, unless cleared on every world change or keyed with the world's `worldSeed`** | id 101 of the next world is a different entity; a stale mesh keyed 101 would alias it. Not reachable in Phase 8 (no NPC render); it becomes a standing review rule from Phase 12 |
| Browser spec across a world boundary | **no** | a spec that reads an id, then `advanceTicks` across a launch/arrival/Continue, must re-read |

**Determinism consequences.** A world is a pure function of `(worldSeed, ordered inputs)`: the hash, snapshots and the Vitest/browser parity depend on that. Concretely: (1) `hashWorld` includes `worldSeed` and `nextId` once anything has spawned (Pattern 5), so identical id sets in two different worlds hash differently; (2) streams are forked from `worldSeed`, so id 101 in world A and in world B draw differently unless A and B are the same `(marketSeed, epoch)`, in which case they are meant to be identical (reload reproduces the world, D-02); (3) a Continue/Load builds the world from the *session's* current `epoch` without bumping (Open Question 2), so the world is regenerated, never "continued".

**Testable assertions (all unit-level; plans 08-05 and 08-15 already carry most):**
- Two `createWorld` calls back to back each issue 101 as the first dynamic id (restart, the intended negative control for "never reused").
- Within one world, spawn then kill then commit 101 never returns 101, including after the highest id is killed and after snapshot/restore.
- The world lifecycle test drives launch, dock, launch, arrival, Continue and asserts a fresh `World` object (identity differs), `store.nextId === 101` at each creation, and the epoch sequence `[1, 1, 2, 3, 3]`, identical with `traffic` true and false (D-05).
- A guard can assert that no `EntityId` or `world/ids` import appears under `src/persistence` (and none of `EntityId` in the probe's published shape). [ASSUMED: a lightweight `rg`-based guard test is an acceptable enforcement form; the plans may prefer a lint `no-restricted-imports` ban.]

**D-05 forward note (not a Phase 8 defect).** D-05 requires `epoch` and the entity-id counter to advance identically with traffic on or off. In Phase 8 the populator is a no-op in both modes, so the fresh-world `nextId` is 101 either way and the proof is exact. From Phase 12 a real populator spawns entities only when traffic is on, which makes the *post-populate* `nextId` differ by mode. The phase that adds the populator must decide whether D-05 then means "the seed and the starting counter are mode-independent" (the reading Phase 8 proves) or whether populate must burn ids with traffic off. Flag to the owner at Phase 12 planning; it does not block this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hash text | New hash or `JSON.stringify` | `fnv1a32` + `canon` from `src/sim/hash.ts`, fixed key order | Throws on non-finite (a feature), normalises `-0`, matches `hashFlight` |
| Seeded draws | New PRNG algorithm | mulberry32 already in `math.ts`, object-state form with the identical sequence | v1 arrival goldens depend on the exact stream |
| Seed derivation | An ad-hoc mixer, or string-FNV world seeds | `mix32`/`fmix32` in `src/sim/rng.ts` exactly as D-02 names it (`worldSeedFor`, `forkSeed`) | Integer-only, engine-independent (`Math.imul`, unsigned shifts), fixed by D-02, vector-pinned |
| Zone enforcement | A plugin or custom ESLint rule | Core `no-restricted-imports` (`regex` allow-list), `-globals`, `-syntax` | Proven in the container; no dependency change |
| Probe lint proofs | Ad-hoc `spawnSync eslint` | `lintProbe` + `withProbeLock` | Shared program, serialised against `tsc` globbing |
| Store invariants tests | Hand-written case lists only | fast-check properties over random spawn/kill/commit/snapshot sequences | Already installed; finds id-reuse and order bugs |
| ECS | bitecs/miniplex/koota | Hand-rolled dense array store | STACK.md Decision 1 |
| Snapshot validation | Trust `JSON.parse` | Strict hand-written `parseWorldSnapshot` returning typed data or `SnapshotError` | Boundary discipline; Phase 11 reuses it |
| Shared limits | Inline literals in `world.ts`, `sanitize.ts`, `snapshot.ts` | One `src/sim/world/limits.ts` (owned by plan 08-05) | Three copies drifted in review round 4 |

**Key insight:** the value of this phase is the *contracts and their mechanical proofs* (hash identity, id order, per-world id scope, snapshot equality, lint zones), not the amount of simulation. Prefer the smallest world step that makes those proofs non-vacuous.

## Runtime State Inventory

This phase is a refactor (the session split) plus additive world code, so the five categories are answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | IndexedDB save blob (schema v2, `MAX_SAVE_CHARS = 65,536`) and settings in localStorage. Phase 8 changes neither schema: `epoch` is session memory only (D-03), and no entity id is stored anywhere (D-06 amendment). | None, verified by scope (CONTEXT D-03, D-06). Keep `buildSnapshotInputs`/`snapshotForSave` inputs byte-for-byte equivalent in the save-controller step. |
| Live service config | None: static client, no external service. | None |
| OS-registered state | None. | None |
| Secrets / env vars | None read by the app; Compose env only (`WEGOLITE_E2E_WAIT_SCALE`, `WEGOLITE_REUSE_PREVIEW`, `CI`); the probe-shape fixture writer adds the opt-in `WEGOLITE_PROBE_SHAPE_WRITE=1` (plan 08-01). | None |
| Build artifacts / installed packages | `dist/` (rebuilt by `npm run build`), the named `wegolite-node-modules` volume (unchanged: no dependency edit), `test-results/`. A stale Vite preview is reused locally only with `WEGOLITE_REUSE_PREVIEW=1`. | Rebuild before every e2e run |

**Canonical question:** after every file is updated, what runtime systems still hold the old shape? Only the browser's already-written v2 save, which is untouched. The `window.__wegolite` probe is rebuilt each page load.

## Common Pitfalls

### Pitfall 1: Order-dependent source-scan tests break on a correct split
**What goes wrong:** `redraw-gate.test.ts` `toEqual`s an ordered pair and `economy-purity.test.ts` scans the first `case "docked":`; alphabetical concatenation reverses the pair and a stray `case "docked":` changes the scanned body.
**How to avoid:** step 0 makes the assertions order-independent and structurally equivalent, proves them green on the monolith, keeps `case "docked":` in exactly one file, and fails loudly on zero or ambiguous session sources.
**Warning signs:** a split step that "fixes" a count by editing a regex.

### Pitfall 2: Probe shape drifts silently
**What goes wrong:** a refactor adds, renames or drops a probe key, or changes `probe.renders` semantics while idle; 25 spec files read the probe.
**How to avoid:** the pre-split shape spec (Pattern 3) in `test:e2e:fast`; `publishProbe` stays once and the probe object is mutated in place.
**Warning signs:** any diff touching `src/app/probe.ts` field names or `updateProbe` assignments during steps 1-9.

### Pitfall 3: Manual clock mishandles commands and the pre-launch autosave
**What goes wrong:** re-evaluating the launch-drain autosave every manual frame, applying commands to every tick, or rendering at alpha 0 after `advanceTicks`.
**How to avoid:** Pattern 10; `sim-driver` unit tests with fakes: commands on tick 1 only, autosave decision once per drain, `advanceTicks(0)`/negative/NaN/huge rejected.

### Pitfall 4: New sim/app files trip the source-scan guards
**What goes wrong:** `tests/guards/sim-purity.test.ts` fails if any `src/sim` import specifier contains `input` (`.filter((specifier) => specifier.includes("input"))` [VERIFIED: tests/guards/sim-purity.test.ts:286-288]) or if any file under `src/sim` (other than `state.ts`), `src/input` or `src/app` declares a type whose name contains `Frame` near `pitch`/`roll` (`declaredFrameTypes`, :114, :257-275).
**How to avoid:** name files and specifiers without `input` (use `controls`, `ctl`, `intent`) and avoid `*Frame*` type names near `pitch`/`roll` text.

### Pitfall 5: A later ESLint block silently drops the zone's other bans
**What goes wrong:** adding `no-restricted-syntax`/`-imports`/`-globals` to the AI block replaces the sim block's list (re-proven this session). A banned `Date` or `for..in` could then pass in `src/sim/ai/**`.
**How to avoid:** shared `const` arrays spread into both blocks; a guard test that a probe in `src/sim/ai/` with `for (const k in o)` and `Date.now()` still fails lint.

### Pitfall 6: Hash identity broken by seed/epoch/statics
**What goes wrong:** including `epoch`, `worldSeed`, statics or `nextId` in the empty-world section changes the v1 hash on the first launch.
**How to avoid:** Pattern 5 (section empty until anything ever spawned); the recorded-flight equality test covers a launch (epoch bump) and an arrival (second bump).

### Pitfall 7: Id reuse, `max+1` recomputation and Map-order after restore
**What goes wrong:** `commit()` or restore recomputes `nextId` as `max(live)+1`, handing a dead entity's id back inside the same world; or code iterates an id index `Map`.
**How to avoid:** `nextId` is stored state and only increments; restore uses the stored value (validated `> maxId`); fast-check "ids ever allocated in one world are unique"; restore-in-reversed-order test. The per-world restart is the *only* way a number repeats, and only across worlds.

### Pitfall 8: Stale world state or ids leaking across a world boundary
**What goes wrong:** a `World` object reused (or its queued events, AI wake list, or a lifecycle cache) survives a launch/arrival/Load, so id 101 of the new world aliases the old one, or a pending event names a dead world's entity.
**How to avoid:** a fresh `World` per boundary (never `reset`), world-owned queues, no id in any out-of-world holder (table above), a lifecycle test asserting object identity changes and `nextId === 101` at every creation.

### Pitfall 9: Per-entity RNG streams keyed by index, forked lazily, or missing from the hash
**What goes wrong:** a stream seeded from array position, or forked at first use, so spawn order shifts draws; an omitted stream state lets diverged worlds hash equal.
**How to avoid:** fork at spawn from `(worldSeed, id, purpose)`; include every state in hash and snapshot; isolation tests.

### Pitfall 10: NaN/`-0` entity crashes the loop
**What goes wrong:** `canon` throws on a non-finite value, which inside `frame()` kills the game; `-0` does not survive JSON.
**How to avoid:** `sanitizeEntity` before hashing, a repair count in the entity line asserted zero in golden scenarios, spawn/control-seam bounds from `limits.ts`.

### Pitfall 11: The test hook captures state, or `advanceTicks` stalls the page
**What goes wrong:** a hook or world holding the `FlightState` object goes stale after a Load or arrival (G-8); an unbounded `n` blocks the main thread.
**How to avoid:** hook methods read live context getters; the world takes the player per call; hard cap and safe-integer check; e2e waits on `probe.frames`/`probe.sim.tick`, never wall time or raised timeouts (PITFALLS 11).

### Pitfall 12: Behaviour change smuggled into the refactor
**What goes wrong:** folding fixes (chart pauses flight, torus message, per-step `Set` allocation) into split commits makes bisecting useless.
**How to avoid:** none of the deferred todos are in scope; the only opportunistic fix permitted is the per-step `Set` allocation (`equipmentSet()` is built each step), and only if behaviour-neutral [CITED: PITFALLS.md:231]. New `disposed` guards and `swapSystem` rAF tracking that go beyond a verbatim move are recorded as deliberate deviations (R4 item 14).

### Pitfall 13: Firefox is not in `verify`
**What goes wrong:** the frame-loop rewrite (plan 08-12) and the manual-clock path (08-14) change `window.addEventListener` wiring and the rAF loop; `verify` and `verify-full` run Chromium only.
**How to avoid:** record a non-blocking `docker compose run --rm e2e-cross` run at the 08-12 gate and after 08-15 in the SUMMARY (R4 item 13).

## Code Examples

Sketches only; none compiled this session (signatures marked `[ASSUMED]` are recommendations). The ESLint shapes were exercised by the container experiment above.

### Serialisable stream, identical sequence
```ts
// src/sim/rng.ts — same arithmetic as createSeededRandom (src/sim/math.ts:227-236)
export interface RngState { s: number }            // uint32, plain data
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
```

### Composed hash (empty section equals `hashFlight`)
```ts
export function hashWorld(player: FlightState, world: World | undefined): string {
  const section = world === undefined ? "" : serializeWorldSection(world); // "" while isNeverSpawned(world)
  return fnv1a32(serializeFlight(player) + (section === "" ? "" : `\n${section}`));
}
// Test: for every sampled tick of each recorded flight, hashWorld(player, world) === hashFlight(player).
```

### Per-world construction (id scope)
```ts
export function createWorld(worldSeed: number): World {
  if (!Number.isSafeInteger(worldSeed) || worldSeed < 0 || worldSeed > MAX_UINT32) throw new RangeError("worldSeed");
  return {
    worldSeed,
    statics: STATIC_ENTITIES,                                   // frozen, layout-referencing, never hashed
    store: createEntityStore({ nextId: FIRST_DYNAMIC_ID, entities: [] }),   // ids restart at 101 per world
    rng: createRngState(forkSeed(worldSeed, NO_ENTITY, "world")),
  };
}
// lifecycle: world = createWorld(worldSeedFor(marketSeed, epoch)) at EVERY boundary; never reuse the old object.  [ASSUMED names]
```

### Zone rules (container-proven shapes)
```js
const SIM_SYNTAX_BANS = [
  { selector: 'NewExpression[callee.name="Date"]', message: "No Date inside src/sim." },
  { selector: "ForInStatement", message: "for..in order is engine/insertion dependent; iterate an array or sorted keys." },
  { selector: 'CallExpression[callee.property.name="sort"][arguments.length=0]', message: "Bare .sort() is lexicographic; pass a total-order comparator." },
  { selector: 'CallExpression[callee.property.name="toSorted"][arguments.length=0]', message: "Bare .toSorted() is lexicographic; pass a comparator." },
];
// src/sim/ai/*.ts (depth 1):
"no-restricted-imports": ["error", { patterns: [{
  regex: "^(?!\\./|\\.\\./(math|world/(ids|view|control))\\.js$)",
  message: "AI modules may import only the WorldView/ShipControl seam, ids and math." }] }],
"no-restricted-syntax": ["error", ...SIM_SYNTAX_BANS, { selector: "ImportExpression", message: "No dynamic import in the AI zone." }],
```

### Flags parser
```ts
export function parseTestFlags(search: string): { hook: boolean; manualClock: boolean; traffic: boolean } {
  const q = new URLSearchParams(search);
  const hook = q.get("test") === "1";
  return { hook, manualClock: hook && q.get("clock") === "manual", traffic: hook && q.get("traffic") === "1" };
}
// Mirrors the existing line at src/app/game-session.ts:3184-3185 (new URLSearchParams(window.location.search).get("test") === "1").
```

### Store invariant property test (outline)
```ts
// fast-check: arbitrary sequence of spawn | kill(id) | commit | snapshot+restore, within ONE world
// after every op: live ids strictly ascending; get(deadId) === undefined;
// every id ever returned by spawn in this world is unique; nextId > every id ever issued;
// restore(snapshot(world)) has equal entityHashes, equal nextId and identical exact snapshot JSON.
// plus (outside the property): two createWorld() calls each issue FIRST_DYNAMIC_ID (the per-world restart).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Player-only `FlightState` hash | World hash composed on top (empty == v1) | This phase | Existing goldens remain valid evidence |
| Closure PRNG | Object-state PRNG with `mix32`-forked streams | This phase | Hashable, snapshot-able, isolated |
| Ids "never reused" globally (ARCHITECTURE 2a reading, player = 1) | Per-world ids from 101, player 100, statics 1-5 | D-06, amended 2026-11-12 | A world is a pure function of its seed; nothing carries an id across worlds |
| Probe-only hook | `advanceTicks` under `?test=1&clock=manual` | This phase | Browser specs count ticks, not seconds (SwiftShader runs the sim at roughly 0.1x real time [CITED: PITFALLS.md Pitfall 11]) |

**Deprecated/outdated:** ARCHITECTURE §5.1's `PLAYER_ID = 1` (superseded by D-06); `08-PATTERNS.md` line 93 ("never-reused monotonic id from 101") and "`Map` for lookup only" predate the per-world wording and the binary-search store; read them as "never reused within its world" and "no Map".

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `MAX_ADVANCE_TICKS = 200,000` is a sensible per-call cap | Pattern 10 | Too low blocks a long e2e wait (raise it); too high allows a multi-second main-thread stall |
| A2 | `mix32` derivation gives adequate stream independence for mulberry32 seeding | Pattern 6 | Correlated streams; mitigated by plan 08-02 tests (distinct seeds for adjacent ids/purposes, 1,000 distinct world seeds over consecutive epochs) and vector pinning before Phase 11 |
| A3 | A constant-speed placeholder integrator in `stepWorld` is acceptable scope until Phases 12-13 | Pattern 9 | If the owner wants no motion, the 1,000-tick test relies on pilot writes and RNG draws only |
| A4 | `-0` normalisation and per-tick `sanitizeEntity` are worth including now | Pattern 7 | Small extra code; omit only if judged premature |
| A5 | New `src/sim/world/**` and `src/sim/ai/**` code can be tested enough to keep the `src/sim/**` coverage floors (lines 93, statements 91, functions 97, branches 86) | Validation | `npm test` fails the threshold; add error-branch tests (snapshot parse failures) |
| A6 | Probe additions are `probe.sim = {tick, epoch, entities, traffic, clock}` plus always-present hook `advanceTicks`/`worldHash` | Pattern 3 | Naming is discretion; a rename only changes the one post-split fixture update |
| A7 | The Playwright Node runner can import pure `src/sim` modules and a Three/DOM/Vite-free `step-options` helper | Pattern 10 | Plan 08-16 has the fallback (a Vitest-written expected-hash fixture); precedent: existing specs import `src/` modules via `tests/e2e/helpers/chart.ts` [CITED: prior session read] |
| A8 | A lightweight guard (an `rg`-style test or a lint ban) is an acceptable way to enforce "no EntityId outside src/sim" | Per-world id scope | If omitted, the per-world rule is enforced by review and the lifecycle test only |
| A9 | The in-flight Continue/Load world is regenerated without an `epoch` bump | Open Question 2 | Unobservable in Phase 8 (no NPC); Phase 11 revisits when `epoch` persists |

## Open Questions (RESOLVED)

Every question below was settled during planning; each names the decision or plan that resolves it.

1. **Does the world exist while docked?** RESOLVED: no; the `launched` event creates it and `docked` drops it; `hashWorld(player, undefined)` equals `hashFlight(player)` (D-02, D-08; plans 08-05, 08-15). The statics live in each world as layout-referencing records (D-07), so nothing static needs a session-long world.
2. **`epoch` on an in-flight Continue/Load.** RESOLVED: the world is recreated (fresh ids from 101, per D-06 as amended) with `worldSeedFor(marketSeed, epoch)` **without** a bump; Phase 11 revisits when `epoch` is persisted (D-03; plan 08-15).
3. **Does `advanceTicks` taint the profile?** RESOLVED: yes, before its first step, so every autosave inside or after the call skips (existing `?test=1` taint rule, D-09; plan 08-14).
4. **`ShipControl` addressing.** RESOLVED: id-addressed signatures with actor-only enforcement in `createShipControl(world, actorId, tick)` (plan 08-07).
5. **Placeholder motion.** RESOLVED: a constant-speed integrator, thrust/attitude port in Phases 12-13 (plan 08-11, Key Decisions row (d) there).
6. **Where does `stepSim` live?** RESOLVED: `src/sim/sim.ts`, `stepSim(player, world, layout, config, intent, commands, dt, options?)`; calls the unchanged `stepFlight` first, `stepWorld` only when a world is passed and the player is launching or in flight (plans 08-11, 08-15).
7. **Observable effect of `?traffic=1` in Phase 8.** RESOLVED: the injected `populate` seam, `probe.sim.traffic`, and parity of `epoch` and fresh-world `nextId` in both modes (D-05, D-10; plans 08-14, 08-15, 08-16). See the D-05 forward note for Phase 12.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | every test/build/lint | yes | 29.8.2 [VERIFIED: `docker --version` this session] | — |
| Docker Compose | `docker compose run --rm <service>` | yes | 5.6.0 [VERIFIED: `docker compose version`] | — |
| Container Node | all tooling | yes | v24.22.2 [VERIFIED: `docker compose run --rm lint node --version`] | — |
| `lint` service image (ESLint, typescript-eslint, TS) | lint experiments and guards | yes (ran this session) | pinned by `compose.yaml`/`Dockerfile` | `docker compose build` |
| Oolite checkout | reading upstream facts | yes: `/home/opencode/git/oolite` (HEAD `4bb1f53de`) | — | do not fetch over the network |
| Host Node | not authoritative | not used | — | do not use for evidence |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` [VERIFIED: file read this session], so this section applies.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (unit/integration, Node env) and Playwright 1.64.1 (Chromium in `verify`/`verify-full`; Firefox only via `e2e-cross`) |
| Config file | `vitest.config.ts` (per-glob coverage thresholds; `src/sim/**` lines 93, statements 91, functions 97, branches 86 [VERIFIED: vitest.config.ts:35-41]), `playwright.config.ts` |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm verify` (per commit/wave); `docker compose run --rm verify-full` (phase gate; split steps 3, 6, 9 and after 08-15) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-10 | Probe shape unchanged across the split (menu, docked, in-flight, paused, chart, saved) | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/probe-shape.spec.ts"` | No - 08-01 |
| FOUND-10 | Redraw-gate and economy-purity scans hold across concatenated session sources | unit | `docker compose run --rm test npx vitest run tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts tests/app/session-source.test.ts` | Partly (re-point in 08-01) |
| FOUND-10 | No golden changed | process | `git diff --exit-code -- tests/golden` after each split step, only the additive `tests/golden/world/` may appear | n/a |
| FOUND-10 | Frame phase order and event-router subscriber order pinned; per-controller fake-context tests | unit | `docker compose run --rm test npx vitest run tests/app/session-order.test.ts tests/app/session` | No - 08-04..08-12 |
| FOUND-11 | Ids unique and never reused within a world; per-world restart at 101; ascending iteration; cap | unit + property | `docker compose run --rm test npx vitest run tests/sim/world/store.test.ts tests/app/session/world-lifecycle.test.ts` | No - 08-05, 08-15 |
| FOUND-11 | Fixed id table; statics as layout-referencing records; player view | unit | `... vitest run tests/sim/world/view.test.ts tests/sim/world/hash.test.ts` | No - 08-05, 08-07 |
| FOUND-11 | `hashWorld === hashFlight` on recorded flights incl. launch, dock, jump; pinned v1 values; epoch bumps | unit/golden | `... vitest run tests/sim/world/hash.test.ts tests/sim/world/flight-hash-pins.test.ts` | No - 08-02, 08-05 |
| FOUND-12 | `createSeededRandom` vectors unchanged; `mix32`/`forkSeed` vectors; fork isolation | unit | `... vitest run tests/sim/rng.test.ts` | No - 08-02 |
| FOUND-12 | Arrival goldens unchanged | unit | `... vitest run tests/sim/hyperspace-arrival.test.ts tests/persistence/autosave.test.ts` | Yes |
| FOUND-12 | Live vs restored world equal over 1,000 ticks (hash and exact snapshot JSON; reversed insertion, killed-highest-id, -0) | unit | `... vitest run tests/sim/world/snapshot.test.ts tests/sim/world/snapshot-codec.test.ts` | No - 08-13 |
| FOUND-12 | Lint rejects `Math.random`, `Date`, wall clock, `for..in`, bare `.sort()` (+ positive controls) | guard | `... vitest run tests/guards/sim-determinism-bans.test.ts` | No - 08-03 |
| FOUND-12 | Same world hash at 30/60/144 Hz including a launch and an arrival | unit | `... vitest run tests/sim/world/world-cadence.test.ts` | No - 08-13 |
| FOUND-13 | Pilot via fake `WorldView` + recording `ShipControl`; JSON round trip; integer timers | unit | `... vitest run tests/sim/ai/test-pilot.test.ts tests/sim/ai/time.test.ts` | No - 08-09 |
| FOUND-13 | AI zone rejects simulation-internal imports (value, type, export-from, dynamic) and keeps the sim bans | guard | `... vitest run tests/guards/ai-zone.test.ts` | No - 08-09 |
| FOUND-14 | `parseTestFlags` and `advanceTicks` contract (bounds, first-step commands, taint, refusal outside manual clock) | unit | `... vitest run tests/app/session/test-flags.test.ts tests/app/session/sim-driver.test.ts` | No - 08-14 |
| FOUND-14 | Browser `advanceTicks(N)` hash equals the Node run of the same N; manual clock does not self-step; traffic off by default and opt-in | e2e + unit | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/tick-hook.spec.ts"`; `... vitest run tests/app/session/tick-parity.test.ts` | No - 08-16 |

### Sampling Rate
- **Per task commit:** the targeted `vitest run <file>` for the files touched; split steps run `docker compose run --rm verify` (D-12).
- **Per wave merge:** `docker compose run --rm verify`; `verify-full` at split steps 3, 6, 9 and after 08-15.
- **Phase gate:** local `docker compose run --rm verify-full` green (the D-01 baseline), `git diff --exit-code -- tests/golden` clean apart from the additive `tests/golden/world/`, a non-blocking `e2e-cross` run recorded after 08-12 and 08-15, then `/gsd-verify-work`. Budget: at most one new browser spec per concern, each under about 60 s under `workers: 2`.

### Wave 0 Gaps
- [ ] Local `verify-full` baseline run, duration recorded (D-01) — plan 08-01.
- [ ] `tests/e2e/probe-shape.spec.ts` + fixtures, added to `test:e2e:fast` — 08-01.
- [ ] `tests/helpers/session-source.ts`; `redraw-gate.test.ts` and `economy-purity.test.ts` re-pointed and made order-independent — 08-01.
- [ ] Recorded v1 `hashFlight` pins (additive golden) and current-closure RNG vectors, captured **before** any `math.ts`/`flight` edit — 08-02.
- [ ] `tests/sim/world/*`, `tests/sim/ai/*`, `tests/sim/rng.test.ts`, the two guard files, `tests/helpers/tick-script.ts`, `tests/e2e/tick-hook.spec.ts` — created by their owning plans.
- [ ] Framework install: none.

## Security Domain

`security_enforcement` is `true` (ASVS level 1, block on high) [VERIFIED: .planning/config.json]. There is no authentication, session or server surface; the relevant controls are input validation at the new boundaries (URL flags, the hook argument, the snapshot JSON parser) and keeping the test seams narrow.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | static client, no accounts |
| V3 Session Management | no | no server sessions |
| V4 Access Control | no | no multi-user surface; the hook is gated by `?test=1`, taints the profile, never writes saves |
| V5 Input Validation | yes | exact-value URL flag parsing (`"1"`, `"manual"`); `advanceTicks` integer/range check; strict `parseWorldSnapshot` (finite numbers, integer ticks, ascending unique ids, bounded counts, uint32 `worldSeed`, known enum values) |
| V6 Cryptography | no | FNV is an integrity checksum, not a security control (documented in `hash.ts:5-6`); no new crypto; `crypto` is added to the sim globals ban |
| V12 Files / V14 Config | marginal | the shipped bundle includes the hook behind `?test=1`; read-once flags and the absence of any save write keep it inert for players |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A shared link `?test=1&clock=manual` freezes a player's session | Denial of service (self-inflicted) | Flags honoured only with `test=1`; no persistence effect; documented as test-only |
| Oversized `advanceTicks` argument freezes the tab | Denial of service | Hard cap, safe-integer check, synchronous bounded loop |
| Hook mutation makes a durable save from hooked state | Tampering | Existing taint rule; `advanceTicks` taints before its first step; autosave skips a tainted profile |
| Malformed snapshot JSON reused by Phase 11 | Tampering | Boundary parser with typed failure; `MAX_ENTITIES` and size bounds now |
| `aiKey` such as `"constructor"` throws in the fixed step | DoS | `Object.hasOwn(registry, aiKey)` dispatch; enum validation at spawn and sanitize |
| A NaN entity throws inside the frame loop | DoS | `sanitizeEntity` before hash; never wrap the hash in try/catch |
| A stale id from a previous world aliases a new entity | Spoofing/Tampering (logic) | Per-world scope: fresh `World` per boundary, no id in any out-of-world holder |
| Unseeded randomness or wall clock sneaks into `src/sim` | Repudiation of determinism | Lint bans plus probe proofs with positive controls |

## Sources

### Primary (HIGH confidence)
- Read this session: `.planning/phases/08-session-split-and-world-core/08-CONTEXT.md`, prior `08-RESEARCH.md`, `08-PATTERNS.md`, `08-REVIEWS.md` (round 4 consensus), `.planning/{REQUIREMENTS,ROADMAP,STATE,PROJECT}.md` (Phase 8 and FOUND-10..14 rows), `.planning/config.json`, `AGENTS.md`.
- `/home/opencode/git/wegolite/src/sim/{math.ts:215-236, hash.ts, events.ts, world/layout.ts:25-64, flight/state.ts:20-183, flight/step.ts:347-350, hyperspace/arrival.ts:66-76}`, `src/app/game-loop.ts`, `src/app/game-session.ts:2790-2864, 3184-3186` and anchor greps, `eslint.config.js` (whole file), `package.json` scripts, `vitest.config.ts:30-64`, `compose.yaml` services, `FIDELITY.md:19,37`.
- `/home/opencode/git/wegolite/tests/app/redraw-gate.test.ts:100-153`, `tests/guards/economy-purity.test.ts:196-207, 305-354`, `tests/guards/sim-purity.test.ts` (greps), `tests/guards/eslint-gate.ts`, `tests/contract/fidelity.test.ts`.
- `.planning/research/ARCHITECTURE.md` (§4.2 line 173, §5.1 line 204, allocation and cap lines 207-209, mapping table line 550), `PITFALLS.md` (pitfall headings 1-4, 7-11, 13, 17, 19, 27), STACK.md Decision 1.
- Oolite checkout `/home/opencode/git/oolite/src/Core`: `OOTypes.h:165-172`, `Universe.m:4841-4844, 5016-5020, 6430-6440`, `Tables/OOBehaviour.tbl`, `Tables/OOScanClass.tbl`.
- Container experiment this session (`docker compose run --rm lint`, ESLint 10.14.0, script in the session scratchpad; output quoted in Pattern 8) for replace-not-merge semantics and selector behaviour.

### Secondary (MEDIUM confidence)
- ARCHITECTURE/PITFALLS quantitative claims (about 121 e2e tests, about 1,366 unit tests, SwiftShader about 0.1x) carried as cited; the repo lists 25 spec files under `tests/e2e`.
- `src/sim/economy/market.ts:41-43` (`marketSeedForSystem`) read in the prior session, not re-read this session.

### Tertiary (LOW confidence)
- None used as authority.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; versions read from `package.json`.
- Architecture: HIGH — locked by CONTEXT plus ARCHITECTURE sections whose anchors were re-verified against the current file; no `src/` commit landed since the prior research (last source commit is the 0.3.0 release).
- Pitfalls: HIGH — each found in code or confirmed by experiment; the manual-clock autosave hazard and the order-sensitive scan tests are derived from reading `frame()` and the tests.
- Per-world id scope: HIGH for Phase 8 behaviour (no NPC, no id holder outside the world exists in v1 code); MEDIUM for the Phase 12+ forward hazards (scene maps, event timing, D-05 reading), which are rules for later phases to honour.

**Research date:** 2026-11-12
**Valid until:** about 30 days (the split target file changes whenever another phase edits `game-session.ts`; re-check the anchors before step 1 if other work lands first).
