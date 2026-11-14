# Phase 12: Inert Ships and the World Lifecycle - Research

**Researched:** 2026-11-14
**Domain:** Deterministic world population (pure TypeScript sim), Three.js instanced NPC rendering, session lifecycle and frame-loop changes, Oolite fidelity (placement, mass lock, blockage, nullAI)
**Confidence:** HIGH for the Oolite rules and the in-repo seams (read this session); MEDIUM for the render path (Three.js docs are r184, the repo is 0.187.0) and for the populator counts (owner discretion)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Entity id counter and the traffic flag
- **D-01:** D-05 of Phase 8 keeps its current reading. The world seed and each fresh world's starting counter (101) do not depend on the traffic flag. Once the populator spawns only with traffic on, the post-populate counter differs by mode, and populate does NOT burn ids with traffic off. A world with no NPC keeps hashing as the v1 flight hash. The Phase 12 plan records this as a Key Decisions row that amends the "D-05 as proven in Phase 8" wording. — **Reversibility:** costly — ids appear in world hashes, goldens and the regenerated-world check; burning ids with traffic off would change the counter every golden pins.

#### Inert ship motion
- **D-02:** Inert ships hold their placement: no motion at all in Phase 12. The Phase 8 constant-speed placeholder integrator (Key Decision (d)) must not move them (speed 0, or the integrator skipped for inert ships). The Oolite thrust and attitude port stays in Phase 13/14. The world hash, the scanner and the blockage and mass-lock checks therefore see fixed positions. — **Reversibility:** reversible — the integrator is replaced wholesale when NPC flight lands; the one test pinning it is deleted with it.

#### Frame rate below 24 fps
- **D-03:** No behaviour change. The slow-motion catch-up cap (`MAX_STEPS_PER_FRAME`) stays as the deliberate bound. Phase 12 only records the decision in Key Decisions and closes the todo. Evidence under load waits for the unscheduled performance phase (former Phase 23). No notice, no automatic quality drop. — **Reversibility:** reversible — a notice or an automatic High to Standard drop can be added later without touching saved data.

#### Contained AI fault (FOUND-15)
- **D-04:** When an entity's AI module throws inside the world step, the step catches it, replaces that entity's AI with `nullAI` (the entity stays in the world and on the scanner, and keeps its id), records the reason (an event or log entry that does not enter the world hash beyond the AI change itself), and the step completes with a deterministic hash. The rule is recorded as a Key Decision. The plan proves it in Vitest before any populator code lands (success criterion 1). — **Reversibility:** costly — the replacement is observable in the world hash and in any later AI or event consumer.

### Claude's Discretion
- How a refused `spawnEntity` reports its reason (FOUND-16), provided the id counter is unchanged on refusal.
- How and where outside-world holders of entity ids (for example a render map keyed by id) are cleared at every world boundary; each needs a Key Decisions row (per-world id scope, plan 08-05 row).
- Placement for the first populator (where Oolite puts each role's ships), Oolite's mass-lock range with real ships, and instancing safety of the Cobra material path: researcher territory (ROADMAP research flag).

### Deferred Ideas (OUT OF SCOPE)
#### Reviewed Todos (not folded)
- `2026-11-10-add-planet-and-sun-collision.md` — former Phase 15, after shields exist.
- `2026-11-11-cargo-purchase-cost-basis-tracking.md` — adds a save field, needs its own ordered bump after v3.
- `2026-11-11-terminal-color-palette-setting.md` — UI setting with no requirement.

Folded todos (in scope): `2026-11-10-keep-simulating-behind-the-chart.md` (closed by WORLD-11), `2026-11-10-fix-torus-refusal-message-under-mass-lock.md` (closed by WORLD-10), `2026-11-10-decide-behaviour-below-24-fps.md` (decided: D-03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-15 | A throwing world-step AI module is contained: recorded rule, step completes, hash deterministic (review WR-01) | Pattern 1: catch inside `invoke` (covers `think` and `onEvent`), `ai = null` as nullAI, new unrouted event for the reason, no `repairs` bump; proof via injectable `registry` argument of `stepWorld` |
| FOUND-16 | `spawnEntity` refuses malformed input with a reason, counter unchanged (review IN-02) | Pattern 2: discriminated `SpawnResult` with a closed reason vocabulary; the throwing accessors are listed; 40 mechanical test call sites |
| WORLD-15 | First populator places inert ships of the six roles, drawn with Oolite models, on the existing scanner, within 50 calls, nullAI stays inert | Oolite placement table, role pick, pure `populateInertWorld`, `InstancedMesh` NPC layer (13 calls worst case), scanner contact extension, integrator skip for `ai === null` |
| WORLD-10 | Mass lock and jump blockage count ships as in Oolite; torus refusal message correct | Oolite predicates (verified), `ShipField` read by `stepFlight`, new `torusRefused` event with Oolite's "Hyperspeed mass-locked." copy, blockage generalisation and the buoy question |
| WORLD-11 | The simulation keeps running behind the chart in flight, including the countdown | Frame-loop chart branch change, `advanceTicks` guard, close-chart-on-docked/jump, inverted `hyperspace.spec.ts` check, pinned unit tests to update |
| WORLD-14 | Jump commit clears every non-static entity; arrival repopulates deterministically | The existing replace-on-arrival path already clears; tests; render layer is per-scene and id-free |
| WORLD-16 | With traffic on, launch/dock/computer/torus as v1; browser tests traffic off by default; existing specs unchanged except the chart-freeze check | **BLOCKING open question 1**: plain `page.goto("/")` sessions have traffic ON today (`test-flags.ts`), and the cold-start budget spec forbids NPC requests |
| SAVE-08 | NPCs not saved; load regenerates the inert world at the leg anchor, hashing identically to a fresh arrival | `serializeWorldSection` equality test, anchor-counter cross-check, mismatch policy |
</phase_requirements>

## Summary

The phase is a chain of seven small, mostly independent changes on top of seams that Phases 8 to 11 already built: a catch in the world step and a result type on `spawnEntity` (first plan, sim only), a ship-aware mass-lock and blockage read in the flight step, a pure deterministic populator, a render-side instanced NPC layer plus scanner contacts, the chart branch of the frame loop, and the lifecycle and save wiring. No new package is needed. The riskiest item is not technical depth but a contradiction between WORLD-16 and the code: browser specs that call `page.goto("/")` (33 call sites) run with traffic ON because `parseTestFlags` returns `traffic: true` whenever `?test=1` is absent (D-10, Phase 8). The existing cold-start spec in `tests/e2e/budget.spec.ts` asserts that no NPC model is requested before the first in-flight frame, and it must pass unchanged, so a real populator breaks it unless plain sessions get traffic off. That needs an owner-level decision before planning (Open Question 1).

Oolite facts are now verified from the checkout (identical to the pinned commit 7437f22 for every file cited). Mass lock is a centre-to-centre test at 25,600 m for every ship scan class except the explicit non-lockers; the blockage rule is `0.1 * mass > d^2` and `d^2 < 25,600^2` for every ship, so an NPC blocks only within about 60 to 100 m. The populator places ships by named location codes (lanes between witchpoint, planet and sun, the station aegis shell); shuttles and scavengers are not populator roles in Oolite at all (the station launches them), so they need a documented placement rule. nullAI in Oolite is an AI that pauses for an hour per update and leaves the ship in IDLE, i.e. at rest; that matches D-02 and maps to `ai: null` in the existing data model.

**Primary recommendation:** Sequence as (1) FOUND-15 + FOUND-16 in Vitest, (2) torus refusal event + `ShipField` mass lock and blockage over a hand-built world, (3) pure populator with a pinned golden hash, (4) lifecycle/save wiring behind the traffic decision, (5) render layer + scanner, (6) chart-behind stepping, (7) browser opt-in smoke + docs. Resolve Open Question 1 (traffic default for plain sessions) and Open Question 2 (NPC collision radius) before writing plans.

## Project Constraints (from AGENTS.md)

No `./CLAUDE.md` or `./.claude/CLAUDE.md` exists in the repo; `AGENTS.md` is the authority [VERIFIED: ls this session]. Directives that bind this phase:

- Everything runs in Docker; a green host run is not evidence. Commands: `docker compose run --rm test`, `docker compose run --rm test npx vitest run <file>`, `docker compose run --rm e2e sh -lc "npm run build && npx playwright test <spec>"`, `docker compose run --rm e2e-cross`, `typecheck`, `lint`, `verify`, `verify-full`.
- `src/sim/` is pure, deterministic, fixed-step; no Three, no DOM, no `Date`, no `Math.random`, no timers; bare `.sort()`, `for..in`, `localeCompare` are lint-banned there (`eslint.config.js`).
- No database; saves stay in IndexedDB. Project code GPL-2.0-or-later; Oolite-derived data stays CC BY-NC-SA with provenance (no new asset in this phase unless OQ2 adds a compiled radius field to existing records, which is data, not a new asset file).
- Content is compiled from Oolite at build time; do not hand-edit generated data (`docker compose run --rm assets` regenerates; `assets:check` is the drift gate).
- Gate by change type: `src/sim/` only needs `test`, `lint`, `typecheck`; `src/app/`, `src/render/`, `src/input/`, `src/ui/`, `index.html` need `verify`; `verify-full` for render, input, persistence or network-guard changes and before release (this phase touches render and the frame loop, so `verify-full` at the end). Owner memory: skip `verify` and `verify-full` for pure-logic plans on this slow machine.
- Scratch reproductions live under `/tmp` and are mounted into the container; never add scratch files to the repo. Read-only reviewers must not modify tracked files.
- All documentation, planning artifacts, commit messages in English. User-visible changes go under `## [Unreleased]` in `CHANGELOG.md` in the same commit. Significant decisions go to `.planning/PROJECT.md` Key Decisions.
- Mechanical tasks (renames, the 40 `spawnEntity` call-site edits, status bookkeeping) go to the cheapest subagent tier; design, simulation, rendering, persistence stay on the main model. Subagent prompts must carry the Reviewer and subagent brief, the codebase-memory instruction and the Oolite path `/home/opencode/git/oolite`.
- Use the codebase-memory index before grepping; prefer `rg`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AI fault containment, spawn refusal, ship mass-lock/blockage predicates | `src/sim` (pure) | — | Determinism product; tested in Node; must not touch DOM or Three |
| Populator (placement, role pick, counts) | `src/sim/world` pure function over `(world, layout, records)` | `src/app/session` supplies records and layout through the `Populate` seam | The Node tick replay and the browser share it (`tests/helpers/tick-script.ts` constraint: no `import.meta.glob`, no DOM) |
| NPC record catalogue load (lazy JSON) | `src/content/ships-npc.ts` (already built) | `src/app/session/start-session.ts` awaits it when traffic is on | `Populate` is synchronous and runs inside the arrival install block (world-lifecycle rule (ii)) |
| NPC model fetch and decode | `src/render/asset-cache.ts` `loadNpcModel` (already built) | app triggers it per ship key present | Lazy per path, outside first load |
| Instanced NPC meshes, camera-relative placement | `src/render` (new body module owned by `SystemScene`) | app passes id-free contact snapshots | Disposes with the scene at a jump; no id holder |
| Scanner contacts | `src/app/hud-model.ts` + `src/render/hud/draw.ts` | sim accessor returns id-free contacts | Reuses the scanner; no new HUD element (Pitfall 21) |
| World lifecycle, epoch, anchor counter, regeneration | `src/app/session/world-lifecycle.ts` (exists) | `restoreWorldAnchor` in save/boot paths | Unchanged ownership; Phase 12 adds the populator and the checks |
| Chart overlay stepping behind | `src/app/session/frame-loop.ts` + `sim-driver.ts` | `chart-controller.ts` closes the chart on dock/jump | Session policy, not simulation |
| Torus refusal wording | `src/app/session/event-router.ts` (copy) | `src/sim/flight/torus.ts` (distinct event) | Sim emits facts, app owns wording (events.ts header) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | 0.187.0 | `InstancedMesh` for NPC ships | Already the render stack [VERIFIED: package.json:25 `"three": "0.187.0"`] |
| zod | 4.6.7 | NPC catalogue validation (already in `ships-npc.ts`) | Existing strict schema [VERIFIED: package.json:26] |
| vitest | 5.0.5 | All new behavioural assertions | Existing [VERIFIED: package.json:44] |
| @playwright/test | 1.64.1 | One opt-in browser smoke, one inverted check | Existing [VERIFIED: package.json:31] |
| typescript | 6.0.2 | Typecheck both projects (`tsconfig.json`, `tsconfig.sim.json`) | Existing [VERIFIED: package.json:41] |

### Supporting
None. No new dependency (the Package Legitimacy Gate is not triggered).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `InstancedMesh` per model primitive | One `Mesh` per ship | Up to 13 calls vs `ships x primitives`; per-ship cost breaks the 50-call budget at about 20 ships (Pitfall 12 says instance by model) |
| `ai: null` as nullAI | New `"null-ai"` key in `AI_KEYS` | A key changes the closed vocabulary shared by `spawnEntity`, `sanitizeEntity` and the snapshot parser (and the snapshot format) for no behavioural gain; Oolite's nullAI never acts |
| Discriminated `SpawnResult` | `Entity \| undefined` plus an out-parameter | The union is clearer; the out-parameter avoids 40 call-site edits but leaves a silent `undefined` path |

**Installation:** none.

**Version verification:** no package is added; the three.js docs available through Context7 are r184 while the repo pins 0.187.0, so `InstancedMesh` API statements are CITED from r184 and must be confirmed by the first Docker render test [ASSUMED for 0.187.0 parity].

## Package Legitimacy Audit

No external packages are installed by this phase; nothing to audit.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
launch event (router)        hyperspaceJumped (router)        Continue / warm Load
       |                              |                              |
       v                              v                              v
 lifecycle.begin(seed) <--------- handleHyperspaceJumped      restoreWorldAnchor(...)
       |   (bump epoch)               | enterSystemById sets            |  resetForRestore(save.epoch)
       |                              | ctx.core.layout FIRST           |  resume(seed) if in flight
       v                              v                                 v
 createWorld(worldSeedFor(seed,epoch))  -- fresh World, ids restart 101 --
       |
       v
 populate(world,{traffic})  -- app closure: traffic ? populateInertWorld(world, ctx.core.layout, npcRecords) : nothing
       |        (world.rng draws -> spawnEntity(...) -> ai:null, speed 0, random orientation)
       v
 anchorNextEntityId = world.store.nextId   (read right after populate)
       |
 per fixed tick:  stepSim
       |   1. ShipField (read-only over world) -> stepFlight(... shipField)   mass lock / blockage / torusRefused
       |   2. stepWorld: update (skip ai===null) -> think/onEvent inside try/catch -> sanitize -> commit
       |
       +--> events: torusRefused/massLockChanged/hyperspaceRefused -> router -> messages
       +--> frame: sim accessor -> id-free contacts[] -> hud-model (scanner "ship" blips)
                                                   -> NpcLayer.update(contacts, cameraWorld) -> InstancedMesh per (model,primitive)

chart open in flight: frame-loop drains input, steps with zero input and no commands, skips render,
                      closeChart on docked / hyperspaceJumped
```

### Recommended Project Structure
```
src/sim/world/
├── world.ts            # spawnEntity -> SpawnResult (Pattern 2)
├── step.ts             # invoke() containment, integrator skip for ai===null (Pattern 1)
├── populate.ts         # NEW pure populateInertWorld(world, layout, records)
├── placement.ts        # NEW Oolite location samplers (lane, shell, random spatial) over a stream
├── ship-field.ts       # NEW read-only mass-lock/blockage queries over the live store
└── contacts.ts         # NEW id-free contact list for HUD and render (no EntityId, no ids.ts import)
src/sim/flight/torus.ts # torusRefused event; ship-aware lock
src/sim/flight/step.ts  # stepFlight takes an optional ShipField
src/sim/sim.ts          # builds the ShipField from the world and passes it
src/app/session/        # start-session (load records, populate closure), frame-loop, sim-driver,
                        # chart-controller (close on dock/jump), event-router (torusRefused copy)
src/render/bodies/npc-ships.ts  # NEW NpcLayer, owned and disposed by SystemScene
src/render/hud/draw.ts, src/app/hud-model.ts   # scanner "ship" and "police" contact kinds
tests/sim/world/        # spawn refusal, ai fault, populate, ship-field, regeneration tests
tests/e2e/              # opt-in traffic spec (budget row + parity), inverted chart check
```

### Pattern 1: Contain the AI module inside `invoke` (FOUND-15, D-04)
**What:** One `try/catch` in `invoke` covers both call sites (`think` and `onEvent` go through `invoke`). On a throw: `entity.ai = null` (nullAI), emit one unrouted event naming the entity and the call site, write the local stream back exactly as the non-fault path does, continue. Do **not** bump `entity.repairs` (it is printed in the entity hash line, and D-04 forbids hash effects beyond the AI change). No exception text enters an event or the hash.
**When to use:** the only containment point; do not wrap `stepWorld` in `stepSim` as well (it would hide non-module bugs).
**Proof:** `stepWorld(world, player, layout, dt, registry)` already takes an injectable `registry` [VERIFIED: src/sim/world/step.ts:64-70], so a Vitest test registers a module that throws on a chosen tick, steps two identical worlds, and asserts equal `hashWorld` every tick, `ai:none` in the entity line, the entity still `store.get`-able with the same id, a scan from another entity still sees it, and one `aiFaulted` event. Do this before any populator code (success criterion 1).
**Example:**
```typescript
// Source: src/sim/world/step.ts:148-165 (current invoke), amended
function invoke(world, entity, view, tick, call, events, site): void {
  if (entity.ai === null) return;
  const stream = createRngState(entity.rng.ai);
  try {
    call({ self: entity.id, view, ctl: createShipControl(world, entity.id, tick),
           ai: entity.ai, random: () => rngNext(stream) });
  } catch {
    entity.ai = null; // nullAI: never thinks again, stays in the world
    events.push({ kind: "aiFaulted", id: entity.id, site }); // site: "think" | "event"
  }
  entity.rng.ai = stream.s; // one rule on both paths
}
```
`events` must be threaded through `drainAiEvents` and `deliverAiEvent`. The new `SimEvent` kind is not routed (the router ignores unrouted kinds [VERIFIED: event-router.ts:380-383 "An unrouted kind ... is ignored, never thrown"]); add it to `RESERVED_EVENT_KINDS`-style documentation, not to `ROUTED_EVENT_KINDS`. An `EntityId` in an event payload is already allowed for the same tick (events.ts "Id lifetime" comment).

### Pattern 2: `spawnEntity` returns a result with a closed reason (FOUND-16)
**What:** Replace `Entity | undefined` with `{ ok: true; entity } | { ok: false; reason }`. `reason` is a closed string union of payload-free codes, for example `"malformed" | "outOfDomain" | "ai" | "storeFull" | "idExhausted"`, never text built from the input (no attacker string reaches a log). Restructure `isLegalSpawn` into a function returning the first violated reason; guard object-ness first (`init`, `init.position`, `init.orientation`, `init.ai`, `init.ai.params`).
**Verified throw sites** (the accessors that throw on `null`/`undefined`): `typeof init.specKey` when `init` is nullish; `isBoundedVec(init.position)` / `isUnitQuat(init.orientation)` dereference `.x`/`.w` of a nullish value; `isLegalAi` calls `Object.keys(ai.params)` which throws on nullish `params` [VERIFIED: src/sim/world/world.ts:228-264 and review 08-REVIEW.md IN-02]. Non-object scalars for the numeric fields already return `false` (`Number.isFinite` on a non-number is `false`).
**Counter rule:** refusal happens before `store.allocate`; `allocate` itself refuses without touching `next` [VERIFIED: store.ts:98-107]. Test: `store.nextId` before and after every refusal row, including a fuzz row of nullish and wrong-typed fields.
**Churn:** 40 call sites in tests across 13 files (6 local `spawnOk` helpers unwrap it); `src/` has no caller outside the definition. Mechanical, delegate to the cheapest tier; the populator is the first real `src` caller. Lower-churn alternative (planner choice): keep `Entity | undefined` and add `trySpawnEntity` returning the union; then `spawnEntity` would not satisfy FOUND-16's wording "refuses ... with a reason", so the union return is the prescriptive choice.

### Pattern 3: A read-only `ShipField` feeds the flight step (WORLD-10)
**What:** `stepFlight` has no world access (signature `stepFlight(state, layout, config, intent, commands, dt, options?)` [VERIFIED: src/sim/flight/step.ts:83-91]); `stepSim` holds both. Build a small read-only object in `stepSim` (or cache it per world with a `WeakMap`) and pass it as an optional trailing parameter, not through app-built `StepOptions`:
```typescript
interface ShipField {
  /** Oolite checkEntityForMassLock over ships: any lock-class ship strictly inside the scanner range. */
  massLocked(position: Vec3, scannerRange: number): boolean;
  /** First blocker (stable order) of a completing jump, or undefined. */
  blockedBy(position: Vec3, scannerRange: number): { mass: number; kind: "ship" } | undefined;
}
```
Implementation iterates `world.store.live` without allocating per call (Pitfall 12), skips `dead`, and reads each ship's mass. The flight step uses `massLocked(position, layout) || ships?.massLocked(...)` at the existing sites: `stepTorus` (line 204), `engageTorus` (line 145). The blockage check at countdown completion (step.ts:274-283) adds `ships?.blockedBy(...)` beside the station check.
**Mass source:** the sim may not import `src/content/ships*`; the populator receives records as a parameter, so a ship's mass must be stored where the field can read it. Options: add `mass` to the hashed entity (new field, snapshot and hash format change, costly) or keep a mass lookup keyed by `specKey` passed into the field at construction (records are static per session). Prescriptive: supply the masses the way `stationMass` already travels, as a read-only array of `{ specKey, mass }` pairs on `StepOptions.hyperspace`/`StepOptions` built by `buildStepOptions` from the loaded records (that builder is shared by the session and the Node replay, so the two cannot drift [VERIFIED: step-options.ts header]); `stepSim` builds the `ShipField` from `options` plus the world. Do **not** add a mass field to `Entity` (hash and snapshot format change). (`CORIOLIS_STATION_MASS` is already a literal pinned to the compiled value by a test, the same pattern [VERIFIED: countdown.ts:59 `export const CORIOLIS_STATION_MASS = 515_483_904;`].)
**Boundary (verified):** for ships Oolite applies a strict `d^2 < SCANNER_MAX_RANGE2` guard before the predicate, so a ship at exactly 25,600 m does not lock; the existing station code uses `<=` [VERIFIED: torus.ts:90-107 doc comment "(`<=`, so the boundary itself locks)" vs PlayerEntity.m:2936]. Implement the ship rule as strict `<`; do not touch the station rule.

### Pattern 4: A pure populator with Oolite's location codes (WORLD-15)
**What:** `populateInertWorld(world, layout, records)` draws only from `world.rng` (the world stream, entity id 0, purpose `"world"` [VERIFIED: world.ts:135]), uses only `+ - * /` and `Math.sqrt` (no `sin`/`cos`/`pow`: cross-engine determinism, Pitfall 4), follows the Oolite samplers, and calls `spawnEntity` with `ai: null`, `speed: 0`, `kind: "ship"`, the record's `scanClass`, `specKey = record.key`. A refused spawn is skipped deterministically (counter unchanged); a test asserts no refusal with the committed catalogue.
Per-ship steps (all verified in Oolite): position = location sample + `OOHPVectorRandomSpatial(spread)` with `spread = 0` for singles; orientation = four uniform draws `floor(u*1024) - 511.5` normalised (`quaternion_set_random`, OOQuaternion.m:41-48; Universe.m:2648 `OORandomQuaternion`); ship chosen by a cumulative-weight draw over records whose role token equals the role (weight = the `(p)` suffix, default 1.0; `OOParseRolesFromString` OORoleSet.m:310; `OOProbabilitySet` privObjectForWeight, one draw times the sum).
**Rejection loops:** port the do-while samplers with a deterministic iteration cap (for example 256) and a documented fallback (accept the last candidate). All 2,048 committed systems satisfy the lane exclusions, but the tightest lane (planet to sun, system `g1-s45`) has only a 1.06 ratio over Oolite's own sanity threshold, so an uncapped loop is unsafe [VERIFIED: computed this session over `src/content/generated/systems/g*.json` with the layout rules of `layout.ts`].
**Counts and rates are out of scope** (roadmap). Prescriptive minimum: a fixed table, one entry per (role, location), small counts (suggested 12 ships: see Assumption A1).

### Pattern 5: Id-free contacts, a per-scene `NpcLayer` (WORLD-15, id-holder rule)
**What:** Add a sim accessor returning plain contacts `{ position, orientation, radius, specKey, kind: "neutral" | "police" }` with no `EntityId` and no import of `ids.ts` (the guard test fails any file under `src` outside `src/sim` that imports it or names `EntityId` [VERIFIED: tests/guards/entity-id-scope.test.ts header]; `ScanClass` also lives in `ids.ts`, so map it to the two-value kind inside sim). The HUD model and the `NpcLayer` consume the list each frame; nothing is keyed by id, so no outside-world holder exists and the Key Decisions row for the id-holder rule states exactly that. The `NpcLayer` is created inside `createSystemScene` and disposed in the scene registry, so a jump (new scene) clears it by construction; launch and dock only change the contact list (world absent while docked means count 0).
**Instancing:** one `InstancedMesh` per (model, primitive), sharing the **cached** geometry and material (do not `cloneMaterials`; that path is for the single player mesh [VERIFIED: ship.ts:20-27, station.ts `cloneMaterials`]). Capacity `MAX_ENTITIES` (256 [VERIFIED: ids.ts:53 `export const MAX_ENTITIES = 256;`]) per type, `count` set per frame, matrices composed as `shipWorld x primitiveWorld` with the camera-relative translation (`cameraRelative`, the same transform path as every body in `sync.ts`), `setUsage(DynamicDrawUsage)`, `frustumCulled = false` (instances move relative to the camera every frame and the instanced bounding sphere is otherwise stale unless recomputed after every `setMatrixAt`; three docs: "Recompute them whenever instance data changes" [CITED: https://github.com/mrdoob/three.js/blob/r184/manual/en/how-to-update-things.html]); `visible = false` while `count === 0`. Dispose only the `InstancedMesh` (its instance buffer); never dispose the cached geometry, material or textures (asset-cache ownership rule).
**Cobra material path (research flag, answered):** the Cobra goes through plain GLB materials cloned per scene with no `onBeforeCompile`, `ShaderMaterial` or custom program anywhere in the ship path [VERIFIED: `rg "onBeforeCompile|ShaderMaterial|InstancedMesh" src/render src/app` returned only the planet, atmosphere and nebula bodies; ship.ts has no tuning]. NPC GLBs use `KHR_materials_specular` (a physical material) and `EXT_texture_webp`, both supported by `GLTFLoader` and by `InstancedMesh` in the standard program [VERIFIED: GLB JSON of `public/models/*.glb` parsed this session: extensionsUsed `KHR_materials_specular`, `EXT_texture_webp`; viper only webp]. Instancing is safe; the only hazards are culling and ownership above. First Docker render test confirms on 0.187.0.
**Draw calls (research flag):** primitives per model parsed from the GLBs this session: adder 1, cobramk1 1, gecko 2, krait 1, mamba 2, moray 2, shuttle 1, sidewinder 1, viper 2 = **13 calls worst case** (all nine types present). In flight the scene today draws 10 [CITED: docs/PERFORMANCE.md "Lave in flight 10"], so 23 of 50; High quality adds up to 5 more (28). With `frustumCulled = false` a type present always counts, which makes the budget assertion a stable upper bound.

### Pattern 6: The chart no longer freezes flight (WORLD-11)
**What (frame loop):** the `chartOpen` branch still drains the chart, command, station-action queues and empties `pending`, but, when the state is `inFlight`, also advances the loop with no commands and a zero input frame through `stepOnce`, then skips render and calls `updateProbe` (opaque overlay, nothing painted). Docked-with-chart stays frozen (nothing to simulate; keeps the docked tests and `tick` parity untouched). The save-screen freeze and pause stay as they are (outside WORLD-11).
**Consequences to wire:** (1) close the chart when a `docked` or `hyperspaceJumped` event arrives while it is open (today the arrival handler only clears `chartSelectedId` [VERIFIED: hyperspace-controller.ts:234]; `docked` would show the station shell under the chart); (2) `advanceTicks` currently refuses when `ctx.chart.chartOpen` and breaks its loop when it opens [VERIFIED: sim-driver.ts:238-257]: allow it in flight so a spec can step behind the chart; (3) the one sanctioned browser change: `tests/e2e/hyperspace.spec.ts:252-257` becomes `expect(clock).toBeGreaterThan(frozenClock)` after `waitFrames(page, 60)`.
**Existing tests that pin the freeze (Vitest, must be edited):** `tests/app/session-order.test.ts:941-964` (frame-order list and "never steps") and `tests/app/session/sim-driver.test.ts:725-733` (a count of exactly four `pending.length = 0;` sites); `tests/app/session/chart-controller.test.ts` and `start-session.test.ts` reference `chartOpen` and need a read.
**Autosave:** unchanged anchors (docked, arrival); a dock behind the chart autosaves at the `docked` event as today.

### Pattern 7: Lifecycle wiring and the regeneration check (WORLD-14, SAVE-08)
**What:** `begin` already replaces the world at the arrival (inside the install block) and the old world is not stepped on the commit tick (jump-step rule, `stepSim` doc [VERIFIED: sim.ts:29-34]), so "clear every non-static entity at jump commit" is satisfied by replacement; tests assert the old `World` object is gone from the lifecycle, the new world's ids restart at 101, and the same `(route, seed, epoch)` gives the same `serializeWorldSection`. No `entityRemoved` events are emitted for the dropped world (it has no consumer).
**Populate seam:** `Populate = (world, { traffic }) => void` is synchronous and runs inside `begin`/`resume` before the anchor counter is read [VERIFIED: world-lifecycle.ts:81 `export type Populate = (`, 140 `const created = createWorld(worldSeedFor(marketSeed, worldEpoch));`, 169 and 182 `anchorNextEntityId = created.store.nextId;`]. The populate closure is built in `startSession` over `ctx`, reads `ctx.core.layout` at call time (already updated before `begin` on launch, arrival, Continue and warm Load: hyperspace-controller.ts:199-225, save-controller.ts:437-452), and receives the loaded records. Load the NPC catalogue (`loadNpcCatalogue()`, about 3 KB [VERIFIED: ls -la 3105 bytes]) once at start-up when traffic is on, with the same single failure surface as the other catalogues; models fetch later.
**Rule (ii):** a populator that can throw must be split into a fallible prepare step before the install block and a commit that cannot fail. Prescriptive: make `populateInertWorld` total (refusals are skipped, loops are capped, records are pre-validated by zod), and state that in the Key Decisions row.
**SAVE-08 proof:** (a) fresh arrival world vs regenerated world: `serializeWorldSection` equal (compare the world section, not `hashWorld`, which also hashes the player state) [VERIFIED: hash `serializeWorldSection` exported, serialize.ts:111]; (b) in-flight save write carries `anchorNextEntityId`, and after `restoreWorldAnchor` the regenerated `store.nextId` equals the saved `nextEntityId` (traffic on); (c) a docked save writes `FRESH_WORLD_NEXT_ENTITY_ID` (101) and has no live world [VERIFIED: autosave.ts:156-159]. Policy on a mismatch (saved counter != regenerated counter, for example a save written with traffic off and loaded with traffic on, which D-01 makes legal): do not reject the save; the world is regenerated from seed regardless; assert equality only in tests.
**Browser parity:** Phase 8 deferred populated-world browser/Node parity to this phase [VERIFIED: 08-RESEARCH Pattern 10 note in PROJECT.md row 237]. `tests/helpers/tick-script.ts` builds `createWorldLifecycle` with no populator; extend it to take the same populate function and the records read with `readFileSync` (Node cannot call `loadNpcCatalogue`).

### Anti-Patterns to Avoid
- **A render map keyed by `EntityId`** or any cache surviving a world change (guard test fails; per-world id scope).
- **Wrapping `stepWorld` in `try/catch` in `stepSim`** instead of containing the module: hides sim bugs and still loses nothing useful.
- **Bumping `entity.repairs` on an AI fault** (changes the hash beyond the AI change).
- **Per-ship `Mesh` with `cloneMaterials` for traffic** (Pitfall 12).
- **A populator that awaits or fetches**: `begin` is synchronous and atomic (G-7).
- **Editing the station mass-lock `<=` rule** while adding the ship rule; Phase 3 tests pin it.
- **Touching `arrival.ts:125`, `torus.ts:78/98`, `countdown.ts:59/77`, `flight/step.ts:218` without refreshing FIDELITY.md rows** (`tests/contract/fidelity.test.ts` checks the cited lines exist inside the files).

## Oolite Reference Findings (verified in `/home/opencode/git/oolite`, files identical to pin 7437f22)

`git diff --quiet 7437f22 HEAD` reports no difference for `PlayerEntity.m`, `Universe.m`, `ShipEntity.m`, `StationEntity.m`, `OOHPVector.m`, `OOProbabilitySet.m` and `oolite-populator.js`; `descriptions.plist` differs but not in the cited keys [VERIFIED: git diff this session].

**Mass lock with real ships.** `PlayerEntity.m:2936` `if (scannedEntity->zero_distance < SCANNER_MAX_RANGE2 || !scannedEntity->isShip)` then `checkEntityForMassLock` (`:3014-3066`). `zero_distance` is the squared centre distance to the player (`Entity.m:858` `zero_distance = HPdistance2(PLAYER->position, position)`). `SCANNER_MAX_RANGE2 655360000.0` (`Entity.h:50`). The ship branch: scan class `CLASS_NO_DRAW` (only cloaked ships lock), `CLASS_PLAYER`, `CLASS_BUOY`, `CLASS_ROCK`, `CLASS_CARGO`, `CLASS_MINE`, `CLASS_VISUAL_EFFECT` do not lock; `CLASS_THARGOID`, `CLASS_MISSILE`, `CLASS_STATION`, `CLASS_POLICE`, `CLASS_MILITARY`, `CLASS_WORMHOLE` and the `default:` branch (which includes `CLASS_NEUTRAL`) lock. All nine compiled NPC records are `CLASS_NEUTRAL` except the viper (`CLASS_POLICE`) [VERIFIED: ships-npc.json]: every inert ship within 25,600 m of the player locks the torus. The range is centre-to-centre, not surface. Stations are ships too (`StationEntity.m:573 isShip = YES`); a buoy is an ordinary `ShipEntity` (no `BuoyEntity` class exists in `src` headers, `rg` this session), so it is a blockage candidate [ASSUMED: shipdata buoy record is built as a plain ship].

**Jump blockage.** `ShipEntity.m:12498-12531` `checkShipsInVicinityForWitchJumpExit`: for every ship other than self (and not a docked player), `if ((k * [ship mass] > d2) && (d2 < SCANNER_MAX_RANGE2))` with `GLfloat k = 0.1`. Blockage radius is `sqrt(0.1 * mass)`: viper 34,040.68 gives 58.3 m, krait 93,291.41 gives 96.6 m, shuttle 11,317.56 gives 33.6 m [VERIFIED: masses from ships-npc.json, arithmetic this session]. The same loop also counts the two buoys (mass 698,691.1875 gives 264.3 m [VERIFIED: ships-client.json]); today the buoys do not block ("the buoy stays non-blocking until Phase 12 consumes per-ship masses" [VERIFIED: PROJECT.md row 181]); see Open Question 3. The check runs at countdown completion only and the H press never consults it (existing, `src/sim/flight/step.ts:155-170`).

**Torus refusal copy.** `descriptions.plist:521` `"jump-mass-locked" = "Hyperspeed mass-locked.";` shown when `j` is pressed while locked (`PlayerEntityControls.m:1166-1175`, `PlayerEntity.m:2751-2756`). `:503` `"witch-blocked" = "Witchspace jump aborted (too close to [blockerName])."` with the blocker's `name`.

**Torus factor** also uses the nearest collidable entity including ships (`PlayerEntity.m:2918-2934`); WORLD-10 does not ask for it. Record a divergence row; do not implement (effect only above 102.4 km from every body).

**nullAI.** `Resources/AIs/nullAI.plist`: `GLOBAL = { UPDATE = ("pauseAI: 3600"); EXIT = ("pauseAI: 1"); }` (it never decides anything). A ship in `BEHAVIOUR_IDLE` runs `behaviour_idle` (`ShipEntity.m:3708-3722`, sticks to zero) and never sets `desired_speed`; the first assignment to `desired_speed` in `ShipEntity.m` is at line 3799 inside a behaviour method (`rg` this session), so a spawned nullAI ship is at rest [CITED: ShipEntity.m rg result]. Maps to `ai: null` and speed 0.

**Placement (Universe.m `locationByCode` 1783-1840, populator `oolite-populator.js`).** `LANE_WIDTH 51200.0` (Universe.m:112).
- `WITCHPOINT`: `OOHPVectorRandomSpatial(SCANNER_MAX_RANGE)` (a uniform ball of radius 25,600 m around the origin).
- `LANE_WP`: `OORandomPositionInCylinder(origin, SCANNER_MAX_RANGE, planet, planetRadius*3, LANE_WIDTH)`; `LANE_WS`: origin and sun (exclusions 25,600 and `sunRadius*3`); `LANE_PS`: planet and sun (`3r` each); `LANE_WPS`: pick WP, PS or WS weighted by lane length. A cylinder sample is `lerp(c1, c2, randf()) + RandomSpatial(51200)` rejected while within either exclusion sphere (`OOHPVector.m:102-114`; random spatial `:75-86`).
- `STATION_AEGIS`: `OORandomPositionInShell(station, collisionRadius*1.2, SCANNER_MAX_RANGE*2.0)`, repeated while within `sqrt(1.5)` planet radii of the planet centre (Universe.m:1811-1815). In Wegolite that is station radius 500 so inner 600 m, outer 51,200 m [VERIFIED: layout.ts `const STATION_RADIUS = 500;`, `STATION_AEGIS_RANGE = 51_200`].
Populator entries per role [VERIFIED: oolite-populator.js]: **traders** `oolite-freighters` LANE_WP (661-666) and `oolite-freighters-docking` STATION_AEGIS (668-673), couriers LANE_WP/LANE_WS (676-689), smugglers LANE_WP (692-697) (`_addShips("trader",1,pos,0)`, single ship, spread 0); **hunters** LANE_WPS and LANE_WP, medium and heavy at LANE_WP/LANE_WS (703-750), groups of 2 to 4 with spread 2,000 m (`_addLightHunter`, 1578-1590); **pirates** LANE_WP, LANE_PS, LANE_WS, LANE_WPS (756-852), groups spread 2,500 m (`_addIndependentPirate`, 1696-1735); **police** LANE_WP and LANE_WPS patrols (927-941) and one STATION_AEGIS station patrol (943-947). `oolite-assassins` and the interceptor witchpoint entries use `WITCHPOINT` and are not among the compiled roles. **Shuttles and scavengers are not populator roles**: Oolite launches shuttles from the station on a timer (`StationEntity.m:830-834`, `launchShuttle`) and scavengers on request (`launchScavenger`, `StationEntity.m:1464-1502`). The first populator must therefore state a placement for them (recommendation: `STATION_AEGIS`, the closest Oolite code to "launched from the station"; Assumption A2).

**Position/orientation of a spawned ship** (`Universe.m:2626` `pos = HPvector_add(pos, OOHPVectorRandomSpatial(radius))`, `:2648` `[ship setOrientation:OORandomQuaternion()]`).

**Scanner colours** (`ShipEntity.m:5582-5586`): neutral `{1,1,0,1}` yellow (already `HUD_SCANNER_NEUTRAL_COLOR` `#ffee33` [VERIFIED: draw.ts]); police `police_color1 {0.5, 0.0, 1.0, 1.0}`; a non-hostile ship uses `neutral_color` by default.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Many ships of one model | One `Mesh` per ship | `THREE.InstancedMesh` per (model, primitive), shared cached material | 13 calls worst case vs unbounded |
| Camera-relative float32 safety | Absolute world positions in matrices | `cameraRelative(world, cameraWorld)` (`src/render/camera-relative.ts`) | The one transform path (`sync.ts`) avoids shimmer |
| NPC record validation | Ad hoc JSON checks | `loadNpcCatalogue()` (strict zod) and `NPC_GLB_PATH_PATTERN` | Existing T-09-16/17 mitigations |
| Model fetch and cache | A second loader | `assets.loadNpcModel(glb)` | Memoised, path-checked, dispose-safe |
| Seeded draws | `Math.random`, closures | `rngNext(world.rng)` / `createRngState` | Hashable, serialisable, lint-enforced |
| World hash comparison | Re-serialising entities | `serializeWorldSection(world)` / `entityHashes(world)` | Already the canonical text |
| Scan class colour rules | A new palette | Oolite constants above, existing `HUD_SCANNER_NEUTRAL_COLOR` | Fidelity |

**Key insight:** every hard part (hash, streams, store, asset cache, lifecycle, snapshot) already exists; the phase is wiring plus three small ports (location samplers, weighted role pick, the ship mass-lock/blockage predicate). Custom code beyond those ports is a smell.

## Id holders outside the world (per-world id scope table)

| Holder | Decision |
|--------|----------|
| NPC render layer | Id-free: contacts are plain `{position, orientation, radius, specKey, kind}` snapshots rebuilt each frame; instance buffers are index-addressed; the layer lives in the `SystemScene` and dies with it at a jump. Key Decisions row: "no outside holder; nothing to clear" |
| Scanner/HUD model | Same contact list; `probe.hud.contacts` stays `string[]` of kinds |
| `aiFaulted` event | Id valid for the emitting tick only (existing event-id rule); consumers must not store it |
| Save | Only `epoch` and `nextEntityId` (a counter, names no entity) |
| `SimEvent` router | Ignores the new kind; no subscriber |
If a plan nonetheless adds an id holder, it must change `tests/guards/entity-id-scope.test.ts` in the same commit with a Key Decisions row stating the clearing rule at every boundary (guard header).

## Common Pitfalls

### Pitfall 1: Plain `goto("/")` sessions run with traffic on (BLOCKING)
**What goes wrong:** `traffic: hook ? params.get("traffic") === "1" : true` [VERIFIED: src/app/session/test-flags.ts:32]. 33 specs call `page.goto("/")` and 7 call `"/?test=1"` [VERIFIED: rg this session]. Once a real populator exists, every plain spec launches into a populated world. `budget.spec.ts` "a cold start to the first in-flight frame" uses `page.goto("/")`, launches, waits for `inFlight`, then asserts **no NPC model or texture was requested** [VERIFIED: tests/e2e/budget.spec.ts:204-250]; model fetch triggered by the `launched` populate would fail it, and the spec must pass unchanged (WORLD-16).
**How to avoid:** needs the owner decision in Open Question 1 before plans are written.
**Warning signs:** `requested.filter(npcPaths)` non-empty; `probe.sim.entities > 0` in a plain session.

### Pitfall 2: Synchronous populate versus the lazy catalogue
`Populate` is sync and runs in the atomic arrival block; `loadNpcCatalogue()` is async. Load the 3 KB records at start-up (traffic on) and keep them in `ctx.core`; never await inside `begin`.

### Pitfall 3: The integrator moves a faulted or inert ship
`stepWorld` sets `entity.speed = Math.max(0, entity.nav.desiredSpeed)` and moves along forward for every live entity [VERIFIED: step.ts:88-94]. A module can set `desiredSpeed` before throwing. Skip the whole update for `entity.ai === null` (inert), which also makes D-02 hold for faulted ships. The test at `tests/sim/world/step.test.ts:136-150` ("advances an entity by forward times speed times dt") spawns with a `null` AI and speed 60 and therefore pins the old rule: rewrite it to use a test-pilot AI entity, and add a row proving an `ai: null` entity with speed does not move. The test-pilot suites (`tests/sim/ai/test-pilot.test.ts`, 8 spawn sites) move entities that carry an AI, so they keep passing.

### Pitfall 4: Draw calls depend on culling
With `frustumCulled` on and stale bounding spheres a type may or may not draw depending on view direction; the budget test then measures a moving target. Use `frustumCulled = false` and `visible = false` at `count 0`.

### Pitfall 5: Shared-material ownership
`AssetCache.dispose` frees cached geometries, materials and textures; a scene must never do so. `InstancedMesh.dispose()` frees only the instance buffer ("Frees the GPU-related resources allocated by this instance" [CITED: r184 InstancedMesh docs]); verify in the first render test that cached resources survive a scene swap.

### Pitfall 6: Unit tests and counters that pin the freeze
`tests/app/session-order.test.ts:941-964`, `tests/app/session/sim-driver.test.ts:725-733` (exactly four `pending.length = 0;`), `chart-controller.test.ts`, `start-session.test.ts`. Plan them as part of the WORLD-11 plan, not as surprises.

### Pitfall 7: Chart open when a terminal event fires
A docking computer or a countdown can finish behind the chart. Without closing the chart on `docked` and `hyperspaceJumped`, the station shell or the new system appears under an open chart overlay and `chartOpen` stays true with the wrong input context.

### Pitfall 8: Hash and flag semantics
`isNeverSpawned` is false after any spawn or any `world.rng` draw; a traffic-off world draws nothing and keeps hashing as the v1 flight hash (D-01). The populate function must not draw from `world.rng` when it has nothing to place or when traffic is off, or the traffic-off hash changes (and every golden). Test: traffic-off `hashWorld` equals `hashFlight` after a launch.

### Pitfall 9: `stepFlight` signature and its pins
Adding a parameter changes a function with FIDELITY pins (`flight/step.ts:218`, `torus.ts:78`, `torus.ts:98`, `countdown.ts:59/77`) and many tests. Keep the new parameter optional and trailing so the 24 test files that call `stepFlight` [VERIFIED: `rg -l "stepFlight\(" tests` this session] are untouched; update FIDELITY.md rows E-07 and E-22 text (E-22 says the buoy mass "is not consumed until Phase 12") and line numbers.

### Pitfall 10: Coverage thresholds in the full `test` service
`vitest.config.ts` gates `src/sim/**` at lines 93, statements 91, functions 97, branches 86 [VERIFIED: vitest.config.ts]. New sim modules need real tests or the full `docker compose run --rm test` fails even when each file passes.

### Pitfall 11: Browser parity pins the replay setup
`tests/helpers/tick-script.ts` mirrors the session (state, profile, seed, geometry, controllers, options, lifecycle). When the populator lands, the replay must use the same populate function and records, or Node and browser hashes diverge for a setup reason, not a bug.

### Pitfall 12: The frozen probe shape
`window.__wegolite` keys and leaf types are frozen by `tests/e2e/probe-shape.spec.ts` (D-13). `hud.contacts` is `string[]` so extra kinds are safe; any new probe key (for example an NPC instance count) needs the fixture update in the same plan. Prefer asserting counts from existing fields (`sim.entities`, `calls`, `hud.contacts`).

### Pitfall 13: Message wording and length
HUD messages clamp at 54 characters (the blocked copy is exactly 54) [VERIFIED: hyperspace-controller.ts:128-130 comment]. Any new copy must fit.

## Code Examples

### Ship mass-lock predicate (Oolite port)
```typescript
// Source: PlayerEntity.m:2936 and 3014-3066 (verified); sim/world/ship-field.ts (new)
const NON_LOCKING = ["CLASS_NO_DRAW", "CLASS_PLAYER", "CLASS_BUOY", "CLASS_ROCK",
  "CLASS_CARGO", "CLASS_MINE", "CLASS_VISUAL_EFFECT"] as const;
// every other scan class, including CLASS_NEUTRAL, locks. Strict <, squared distances.
function lockedByShip(distSq: number, scanClass: string, range: number): boolean {
  return distSq < range * range && !(NON_LOCKING as readonly string[]).includes(scanClass);
}
```

### Blockage over ships (reuse the existing predicate)
```typescript
// Source: src/sim/hyperspace/countdown.ts:77-84 (isWitchspaceBlocked), reused unchanged
// 0.1 * mass > d2  &&  d2 < range^2  ->  isWitchspaceBlocked(d2, mass, range)
```

### Frame-loop chart branch (shape)
```typescript
// Source: src/app/session/frame-loop.ts:112-121 (current), amended
if (ctx.chart.chartOpen) {
  currentInput.drainCommands(); currentInput.drainStationActions(); pending.length = 0;
  ctx.core.currentFrame = ZERO_FRAME;
  if (currentState.mode === "inFlight" && !ctx.runtime.paused) simDriver.advanceBehind(delta);
  redrawGate.request(); updateProbe(); return;
}
// advanceBehind: loop.advance(delta, [], () => stepOnce([], ZERO_FRAME)) -- no drain, no launch autosave
```

### NPC layer update (shape)
```typescript
// Source: three.js InstancedMesh API [CITED: r184 docs]; camera-relative per sync.ts
mesh.frustumCulled = false;
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
for (let i = 0; i < n; i += 1) { matrix.compose(rel(contacts[i]), quatOf(contacts[i]), ONE); mesh.setMatrixAt(i, matrix); }
mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chart freezes the sim (v1 D-01) | Sim runs behind the opaque chart (Oolite) | WORLD-11, owner 2026-11-13 | One sanctioned browser test inversion plus the Vitest pins above |
| `spawnEntity` returns `undefined` on refusal | Returns a result with a closed reason | FOUND-16 | 40 mechanical call sites |
| Torus refusal reported as `torusDisengaged` | A distinct refusal event with Oolite's copy | WORLD-10 | `tests/sim/torus.test.ts:295,350-355` pins the old event |
| Coriolis-only blockage | Every massed ship in range | WORLD-10 | `tests/sim/hyperspace-blockage.test.ts` plus FIDELITY E-22 |

**Deprecated/outdated:** the Phase 8 constant-speed placeholder integrator for entities with no AI (Key Decision (d)); amend that row.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Suggested populator table of about 12 ships (traders 3: two LANE_WP and one STATION_AEGIS; hunters 2 LANE_WPS; pirates 3 across LANE_WP/PS/WS; police 2: LANE_WPS and STATION_AEGIS; shuttle 1 and scavenger 1 STATION_AEGIS), singles with spread 0, no groups, no repopulation | Pattern 4 | Owner may want other counts; counts are hashed so changing them later re-pins goldens |
| A2 | Shuttles and scavengers are placed with `STATION_AEGIS` (Oolite has no populator entry for them; the station launches them) | Oolite findings | A different rule changes scanner and mass-lock appearance near the station |
| A3 | A compiled collision radius is wanted on the NPC records (OQ2); otherwise a placeholder is hashed | Open Questions | Golden churn when the real radius arrives |
| A4 | Behind-chart stepping applies in flight only; a chart opened while docked stays frozen | Pattern 6 | If the owner wants docked stepping, `tick` and docked tests change |
| A5 | `InstancedMesh` with `count = 0` is skipped by the renderer (no draw call); `visible = false` makes it certain | Pattern 5 | A phantom call per empty type; harmless under the 50 budget |
| A6 | three 0.187.0 `InstancedMesh` and bounding-sphere behaviour match the r184 docs | Standard Stack | A culling surprise; mitigated by `frustumCulled = false` |
| A7 | The e2e build can carry a build-time traffic default (a Vite `define` set only in the e2e, verify and verify-full compose services), precedent: `vite.seams.config.ts` test-only bundle | Open Question 1 option B | If not feasible, the only compliant route is the owner revising D-10 |
| A8 | A seam spec for blocker copy needs no probe key; copy is chosen from an event field | Open Question 3 | Probe-shape fixture update if a key is added |

## Open Questions

1. **BLOCKING: traffic default for plain sessions (WORLD-16, D-10).**
   - What we know: production and every `page.goto("/")` spec has traffic on; WORLD-16 says browser tests run traffic off and pass unchanged; the cold-start budget spec forbids NPC requests before the first in-flight frame; D-10 says production always has traffic once it exists.
   - What's unclear: how plain sessions get traffic off without changing 33 specs.
   - Options: (A) the owner amends D-10 so production traffic stays off until a later phase (simplest, no code, changes the roadmap's "traffic on" success wording to opt-in); (B) keep D-10 and add a build-time default: the compose `e2e`, `verify`, `verify-full` services set an environment variable that a Vite `define` turns into "traffic default off" for that bundle only, with one opt-in `?test=1&traffic=1` spec covering the populated flow (precedent: `vite.seams.config.ts`); (C) edit the 33 specs to `?test=1` (violates "unchanged").
   - Recommendation: B, with an explicit Key Decisions row; ask the owner to confirm because it means the shipped default is not exercised by the plain browser specs. A is the fallback if B proves awkward.

2. **NPC collision radius.** `SpawnInit.radius` must be a positive finite number [VERIFIED: world.ts:254], is hashed (`r:` field), and feeds the scanner rim rule; the NPC records carry no radius [VERIFIED: ship-npc.ts schema]. Oolite's radius is `sqrtf(max vertex distance squared)` of the mesh (`OOMesh.m:1795-1822`). Recommendation: add `radius` to the compiled NPC records in the same build step as `mass` (nine numbers, strict schema, `assets:check` drift gate, regenerate with `docker compose run --rm assets`); the cheaper placeholder constant would be hashed and re-pinned later.

3. **Blockage scope beyond ships.** Oolite's loop also blocks on the two buoys (264 m) and any station; Phase 10 computed the buoy mass "so Phase 12 does not duplicate the work". Recommendation: include the buoys through the same predicate (mass pinned by a test to the compiled value like `CORIOLIS_STATION_MASS`) and add the "blocked" copy variants (station / ship / buoy, each at most 54 characters, for example `Witchspace jump aborted: too close to a ship`) carried by an event field, not by an entity id. If the owner prefers the smaller scope, ships only and a FIDELITY divergence row. Audit `hyperspace.spec.ts` flight paths for a countdown completing within 264 m of a buoy before enabling.

4. **How a blocker is named in the event.** `hyperspaceRefused` is payload-free today. Recommendation: add an optional `blocker: "station" | "ship" | "buoy"` field; the app owns the wording.

5. **Model fetch timing under traffic.** Recommendation: request models when the contact list first contains a `specKey`; draw only loaded types; a failed load marks the key failed (no retry loop) and the scanner still shows the contact.

6. **Plan count and gates.** Suggested split (8 plans): P1 FOUND-15 + FOUND-16 (sim, `test`+`lint`+`typecheck`); P2 torus refusal event + `ShipField` (sim, same gates); P3 populator + pinned golden (sim); P4 NPC `radius` content field (only if OQ2 accepted; `assets:check`); P5 lifecycle, records load, regeneration test, tick-script update (app, `test`); P6 NPC layer + scanner (render/app, `verify`); P7 chart behind (app, `verify`); P8 browser smoke, docs, Key Decisions, CHANGELOG, `verify-full`. Order P1 before everything (roadmap rule).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | All tests and builds (AGENTS.md) | yes | 29.8.2 [VERIFIED: `docker --version`] | — |
| Oolite checkout | Behaviour reference | yes | `/home/opencode/git/oolite` (HEAD 4bb1f53de; cited files equal pin 7437f22) | — |
| Host Node/Playwright | not authoritative | n/a | `node_modules` exists on the host but must not be used as evidence | Docker services |
| Context7 | three.js docs | yes | r184 docs | repo pins 0.187.0 (A6) |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (unit/integration, node), Playwright 1.64.1 (Chromium; Firefox via `e2e-cross`) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `docker compose run --rm test npx vitest run <file>` |
| Full suite command | `docker compose run --rm test` (with coverage thresholds); `docker compose run --rm verify` (fast gate); `docker compose run --rm verify-full` (release gate) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-15 | Throwing module (think and onEvent): entity keeps id, `ai:none`, one `aiFaulted` event, equal `hashWorld` across two runs, other entities unaffected, no `repairs` change | unit | `docker compose run --rm test npx vitest run tests/sim/world/step.test.ts` | extend (file exists) |
| FOUND-16 | Each malformed row (nullish init, position, orientation, ai, params, wrong types) returns a reason and leaves `nextId` unchanged; no throw | unit | `docker compose run --rm test npx vitest run tests/sim/world/store.test.ts` | extend; new `spawn-refusal.test.ts` optional |
| WORLD-10 | Ship lock at 25,599 / 25,600 / 25,601 m (strict), non-locking classes, blockage at the radius boundary (viper 58.3 m: in/out), torus refused emits `torusRefused` not `torusDisengaged`, copy "Hyperspeed mass-locked." | unit | `... vitest run tests/sim/mass-lock.test.ts tests/sim/hyperspace-blockage.test.ts tests/sim/torus.test.ts tests/app/session-order.test.ts` | extend (files exist); new `tests/sim/world/ship-field.test.ts` |
| WORLD-15 | Populator: deterministic ships/ids/hash per seed, role pick weights, locations inside their regions, `ai:null`, speed 0, no refusal with the committed catalogue, pinned golden section text, traffic-off hash equals `hashFlight`; inert ships do not move over N ticks; scanner contact kinds; draw calls | unit + browser | `... vitest run tests/sim/world/populate.test.ts tests/hud/projection.test.ts`; browser: `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/<traffic-spec>"` | ❌ Wave 0 |
| WORLD-11 | Frame loop steps in flight behind the chart with zero input and no commands; docked stays frozen; countdown advances; chart closes on `docked`/`hyperspaceJumped`; `advanceTicks` allowed in flight; clock advances (browser) | unit + browser | `... vitest run tests/app/session-order.test.ts tests/app/session/sim-driver.test.ts tests/app/session/chart-controller.test.ts`; `... playwright test tests/e2e/hyperspace.spec.ts` | edit existing |
| WORLD-14 | After `hyperspaceJumped` the old world is gone, new ids from 101, same `(route, seed, epoch)` same world section | unit | `... vitest run tests/app/session/world-lifecycle.test.ts tests/app/session/tick-parity.test.ts` | extend |
| WORLD-16 | Traffic variants of launch, dock capture, computer dock, torus as unit tests; existing browser suite unchanged under the OQ1 resolution; Firefox core loop | unit + browser | `docker compose run --rm verify-full`; `docker compose run --rm e2e-cross` | existing + new unit variants |
| SAVE-08 | Fresh arrival world section equals regenerated section; anchor `nextId` equals saved `nextEntityId` (traffic on); docked save writes 101 | unit | `... vitest run tests/persistence/save-v3.test.ts tests/app/session/world-lifecycle.test.ts` | extend |

### Sampling Rate
- **Per task commit:** the targeted `vitest run <file>` above, plus `docker compose run --rm lint` and `typecheck` for sim plans.
- **Per wave merge:** `docker compose run --rm test` (coverage thresholds apply) and, for render/app plans, `docker compose run --rm verify`.
- **Phase gate:** `docker compose run --rm verify-full` green (render, input and frame-loop changes), then `/gsd-verify-work`. Owner preference: no `verify`/`verify-full` for pure-logic plans.

### Wave 0 Gaps
- [ ] `tests/sim/world/populate.test.ts` — determinism, placement regions, role weights, golden section text (WORLD-15, WORLD-14)
- [ ] `tests/sim/world/ship-field.test.ts` — strict-range lock, class table, blockage radii (WORLD-10)
- [ ] `tests/sim/world/spawn-refusal.test.ts` (or rows in `store.test.ts`) — FOUND-16 matrix with counter checks
- [ ] A traffic-on browser spec (`?test=1&traffic=1&clock=manual`): `sim.entities > 0`, `hud.contacts` contains a ship kind, `calls <= 50`, populated-world `worldHash` equals the Node replay (Phase 8 deferral), plus the new `docs/PERFORMANCE.md` row
- [ ] Update `tests/helpers/tick-script.ts` to take the populate function and the records
- [ ] Framework install: none

## Security Domain

### Applicable ASVS Categories (level 1, `security_enforcement` on)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `spawnEntity` result with closed reasons; zod strict NPC schema; `NPC_GLB_PATH_PATTERN`; save `epoch`/`nextEntityId` bounds (existing) |
| V6 Cryptography | no | — (no hand-rolled hashing beyond the existing FNV world hash) |
| V12 Files/resources | partial | model path pattern before any fetch (existing) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A throwing AI module stalls or crashes the fixed step | Denial of service | try/catch in `invoke`, `ai = null`, event with no exception text |
| Malformed spawn input throws in the frame loop | Denial of service | Guard object-ness first; refuse with a code; counter untouched |
| Prototype-name lookups (`"constructor"`) in role/AI tables | Tampering | `Object.hasOwn` (existing `aiModuleFor`); build role tables from validated records |
| Oversized world (entity cap, instance buffers, per-tick allocation) | Denial of service | `MAX_ENTITIES` 256, fixed capacity per `InstancedMesh`, no per-tick allocation in `ShipField` |
| Tampered save counters or epoch | Tampering | Existing v3 schema bounds; a counter mismatch never blocks a load |
| Crafted URL flags change a normal session | Tampering | Flags stay inert without `?test=1` (T-08-26); if OQ1 chooses a build-time default it is not URL-controlled |
| Untrusted NPC JSON/GLB | Tampering | Strict schema, path pattern, models fetched only from same-origin `models/<name>.glb` |

## Sources

### Primary (HIGH confidence)
- In-repo files read this session: `src/sim/world/{world,step,store,entity,ids,limits,view-impl,control-impl,serialize,layout}.ts`, `src/sim/{sim,events,rng,commands}.ts`, `src/sim/flight/{step,torus}.ts`, `src/sim/hyperspace/{countdown,jump,arrival}.ts`, `src/sim/ai/{types,registry,time}.ts`, `src/app/session/{world-lifecycle,event-router,hyperspace-controller,chart-controller,frame-loop,sim-driver,render-driver,save-controller,start-session,step-options,test-flags}.ts`, `src/app/hud-model.ts`, `src/render/{asset-cache,sync,mesh}.ts`, `src/render/bodies/ship.ts`, `src/render/hud/{draw,projection}.ts`, `src/content/{ships-npc,types}.ts`, `src/content/schemas/ship-npc.ts`, `src/persistence/autosave.ts`, `tests/e2e/{budget,hyperspace,npc-assets}.spec.ts`, `tests/guards/entity-id-scope.test.ts`, `tests/app/session-order.test.ts`, `playwright.config.ts`, `vitest.config.ts`, `docs/PERFORMANCE.md`, `FIDELITY.md`, `PROJECT.md` rows 181, 213, 236-237, 245-246.
- Oolite checkout `/home/opencode/git/oolite`: `src/Core/Entities/PlayerEntity.m` (2893-3066, 6540-6570), `ShipEntity.m` (3708-3722, 5582-5700, 12490-12531), `StationEntity.m` (815-840, 1464-1502), `src/Core/Universe.m` (112, 1707-1840, 1973-2010, 2608-2650), `src/Core/OOHPVector.m` (60-125), `src/Core/OOProbabilitySet.m` (525-575), `src/Core/OORoleSet.m` (286-313), `src/Core/OOMesh.m` (1795-1822), `Resources/Scripts/oolite-populator.js`, `Resources/AIs/nullAI.plist`, `Resources/Config/descriptions.plist` (503, 521).
- Context7 `/mrdoob/three.js/r184`: InstancedMesh bounding volumes after `setMatrixAt`, `dispose`.

### Secondary (MEDIUM confidence)
- GLB JSON chunks of `public/models/*.glb` parsed with a local script (primitive counts, extensions).
- Lane solvability computed over `src/content/generated/systems/g*.json`.

### Tertiary (LOW confidence)
- none; every unverified item is in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependency; all APIs read in the repo.
- Architecture: HIGH for sim/lifecycle/chart seams (read and traced); MEDIUM for the render layer (docs r184 vs 0.187.0, A5/A6).
- Oolite rules: HIGH — read from the checkout, identical to the pin.
- Pitfalls: HIGH for the traffic-default conflict and the pinned tests (grep and read); MEDIUM for populator counts (owner discretion).

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 (stable code; revisit if OQ1 or OQ2 change the contract)
