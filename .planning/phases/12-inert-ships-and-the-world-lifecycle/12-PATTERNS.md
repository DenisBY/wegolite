# Phase 12: Inert Ships and the World Lifecycle - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 22 (new and modified)
**Analogs found:** 20 / 22 (all analog paths are git-tracked source)

Locked owner decisions applied: (1) production traffic stays ON (D-10); e2e, verify and verify-full compose builds default traffic OFF at build time (precedent `vite.seams.config.ts`), plus one `?test=1&traffic=1` spec; the 33 `goto("/")` specs stay unchanged. (2) A compiled `radius` (max vertex distance from the mesh) is added beside `mass` on NPC records.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/sim/world/step.ts` (mod: `invoke` catch, skip integrator for `ai===null`) | sim step | event-driven | itself (lines 64-165) | exact |
| `src/sim/world/world.ts` (mod: `spawnEntity` -> `SpawnResult`, `isLegalSpawn`) | sim model | request-response | itself (lines 228-300) | exact |
| `src/sim/world/populate.ts` (new, `populateInertWorld`) | sim utility | batch/transform | `src/sim/world/world.ts` `createWorld` + `world.rng` use | role-match |
| `src/sim/world/placement.ts` (new, Oolite location samplers) | sim utility | transform | `src/sim/world/aegis.ts` / `layout.ts` (pure geometry, no trig) | role-match |
| `src/sim/world/ship-field.ts` (new, mass lock + blockage reads) | sim utility | request-response | `src/sim/hyperspace/countdown.ts:75-100` (`isWitchspaceBlocked`) | role-match |
| `src/sim/world/contacts.ts` (new, id-free contacts) | sim utility | transform | `src/sim/world/view-impl.ts` | role-match |
| `src/sim/flight/torus.ts`, `src/sim/flight/step.ts` (mod: optional trailing `ShipField`, `torusRefused` event) | sim step | request-response | themselves (torus.ts:90-107, step.ts:145,204,274-283) | exact |
| `src/sim/sim.ts` (mod: build ShipField, pass) | sim glue | request-response | itself (lines 36-62) | exact |
| `src/app/session/step-options.ts` (mod: ship masses) | config builder | transform | `CORIOLIS_STATION_MASS` path in countdown.ts:59 | role-match |
| `tools/oolite-ingest/convert/ship-mass.ts` + `npc-ships.ts` + `generate.ts` (mod: `radius`) | build tool | batch | `computeShipMasses` / `compileNpcShips` (same files) | exact |
| `src/content/schemas/ship-npc.ts` (mod: `radius`) | schema | validation | itself (zod `mass` field, line 36) | exact |
| `src/app/session/start-session.ts` (mod: records load, populate closure) | provider | event-driven | itself (lines 305+) and `world-lifecycle.ts:77-87,129-140` | exact |
| `src/app/session/test-flags.ts` + `vite.config.ts` + `vite.seams.config.ts` + `compose.yaml` (build-time traffic default) | config | build | `__WEGOLITE_TEST_SEAMS__` define (vite.config.ts:69-72, vite.seams.config.ts) | exact |
| `src/app/session/frame-loop.ts`, `sim-driver.ts`, `chart-controller.ts` (chart behind) | controller | event-driven | frame-loop.ts:112-121 | exact |
| `src/app/session/event-router.ts` (mod: `torusRefused` copy) | controller | event-driven | itself (ignores unrouted kinds ~380) | exact |
| `src/render/bodies/npc-ships.ts` (new, `NpcLayer`) | render component | streaming | `src/render/bodies/ship.ts`, `buoy.ts` (scene-owned bodies) | role-match |
| `src/app/hud-model.ts`, `src/render/hud/draw.ts` (mod: scanner contacts) | component | transform | themselves | exact |
| `tests/helpers/tick-script.ts` (mod: populate + records) | test helper | batch | itself (line 123) | exact |
| Vitest: `tests/sim/world/{step,store}.test.ts` etc. (new rows) | test | - | `tests/sim/world/step.test.ts`, `tests/sim/mass-lock.test.ts`, `hyperspace-blockage.test.ts` | exact |
| `tests/e2e/hyperspace.spec.ts` (inverted check), new opt-in traffic spec | e2e test | - | `tests/e2e/budget.spec.ts` | role-match |
| `PROJECT.md`, `FIDELITY.md`, `CHANGELOG.md` rows | docs | - | existing rows | exact |
| `tests/guards/entity-id-scope.test.ts` | guard | - | no change needed (id-free design) | n/a |

## Pattern Assignments

### `src/sim/world/step.ts` (FOUND-15, D-02)

**Integrator skip** (current lines 88-94, the loop to guard): add `|| entity.ai === null` to the `continue` condition, because the placeholder integrator moves any live entity.
```typescript
for (let i = 0; i < n; i += 1) {
  const entity = world.store.live[i];
  if (entity === undefined || entity.dead) continue;
  entity.speed = Math.max(0, entity.nav.desiredSpeed);
  const forward = rotate(entity.orientation, FORWARD);
  entity.position = add(entity.position, scale(forward, entity.speed * dt));
}
```
**Containment** (current `invoke`, lines 148-165): wrap `call(...)` in `try/catch`; on catch set `entity.ai = null`, push an unrouted `aiFaulted` event (site `"think" | "event"`, no exception text, no `repairs` bump); keep `entity.rng.ai = stream.s` after. `events` must be threaded to `drainAiEvents`/`deliverAiEvent` (lines 175+). The think loop at 105-116 already skips `ai === null`.
```typescript
const stream = createRngState(entity.rng.ai);
call({ self: entity.id, view, ctl: createShipControl(world, entity.id, tick),
       ai: entity.ai, random: () => rngNext(stream) });
entity.rng.ai = stream.s;
```
**Test seam:** `stepWorld(world, player, layout, dt, registry = AI_REGISTRY)` (line 64-70) accepts an injected registry; the proof test registers a throwing module (see `tests/sim/world/step.test.ts`, `tests/sim/ai/test-pilot.test.ts`). Rewrite the test at `step.test.ts:136-150` (null AI moving at speed 60) to use a test-pilot entity, and add a row that `ai:null` with speed does not move.

### `src/sim/world/world.ts` (FOUND-16)

Throw sites to guard before `isLegalSpawn` (lines 246-264): nullish `init`, `init.position`, `init.orientation`, `init.ai`, `init.ai.params` (`Object.keys(ai.params)` at line 234). Keep the closed vocabulary check style (lines 229, 250-253: `(ARRAY as readonly string[]).includes(x)`, never `in`). Refusal occurs before `store.allocate` (store.ts:98-107), so `store.nextId` is unchanged. Return `{ ok: true; entity } | { ok: false; reason }` with payload-free reason codes. 40 test call sites in 13 files are mechanical (6 local `spawnOk` helpers): delegate to the cheapest tier.

### `src/sim/world/populate.ts` and `placement.ts` (WORLD-15)

**Analog:** `world.rng` is created in `createWorld` (world.ts:131-138: `rng: createRngState(forkSeed(worldSeed, NO_ENTITY, "world"))`); draw with `rngNext(world.rng)`. `isNeverSpawned` (world.ts:162-169) is false after any draw, so a traffic-off world must not draw (D-01): the populate closure in the app calls `populateInertWorld` only when `traffic` is true. Use only `+ - * /` and `Math.sqrt` (no sin/cos/pow; lint bans bare `.sort()`, `for..in`, `localeCompare` in `src/sim`). Spawn each ship via `spawnEntity` with `ai: null`, `speed: 0`, `kind: "ship"`, `scanClass` and `radius` from the record (the compiled radius, decision 2), `specKey = record.key`. Skip refused spawns; cap rejection loops (for example 256). Placement constants: `STATION_RADIUS = 500`, `STATION_AEGIS_RANGE = 51_200` from `layout.ts`; `LANE_WIDTH 51200`, `SCANNER_MAX_RANGE 25600`. See RESEARCH "Placement" for the Oolite location codes. Shuttle and scavenger use `STATION_AEGIS` (A2).

### `src/sim/world/ship-field.ts` and torus/flight changes (WORLD-10)

**Analog** `src/sim/hyperspace/countdown.ts:75-100`:
```typescript
export function isWitchspaceBlocked(distanceSquared, stationMass, scannerRange): boolean {
  return (
    WITCH_BLOCK_K * stationMass > distanceSquared &&
    distanceSquared < scannerRange * scannerRange
  );
}
```
Reuse this predicate per ship. Add an optional trailing `ships?: ShipField` to `stepFlight` (signature at `src/sim/flight/step.ts:83-91`, keeps the 24 calling test files untouched). Sites: `engageTorus` (~145), `stepTorus` (~204), blockage at countdown completion (~274-283). Ship mass lock is strict `<` (station rule stays `<=`, torus.ts:90-107). Do NOT add `mass` to `Entity`; supply `{specKey, mass}` pairs through `StepOptions`, built in `src/app/session/step-options.ts` (shared with the Node replay), the same way `stationMass` travels. `stepSim` (sim.ts:36-62) builds the field from `world` plus options and passes it to `stepFlight`. Emit a new `torusRefused` event (Oolite copy "Hyperspeed mass-locked."), routed in `event-router.ts`; copy must be 54 chars or fewer. Existing pins to update: `tests/sim/torus.test.ts:295,350-355`, `tests/sim/mass-lock.test.ts`, `tests/sim/hyperspace-blockage.test.ts`, FIDELITY rows E-07 and E-22 (line numbers are checked by `tests/contract/fidelity.test.ts`).

### `tools/oolite-ingest/convert/ship-mass.ts`, `npc-ships.ts`, `generate.ts`, `src/content/schemas/ship-npc.ts` (decision 2: `radius`)

**Analog:** the mass path end to end.
- `generate.ts:176`: `const masses = computeShipMasses(MASS_SHIP_KEYS, catalogue, models);` then `emitNpcShips(catalogue, masses)` at line 185. Add a parallel `computeShipRadii` (same keys, same `models`, same `ParsedMesh` input) and hand it in.
- `ship-mass.ts:178-188` `computeShipMasses` pattern (Map keyed by key, `shipMass` per key, fail through `fail(key, SHIPDATA_FILE, ...)` on non-finite or non-positive):
```typescript
export function computeShipMasses(keys, catalogue, meshes): ReadonlyMap<string, number> {
  const masses = new Map<string, number>();
  for (const key of keys) {
    if (!masses.has(key)) masses.set(key, shipMass(key, catalogue, meshes));
  }
  return masses;
}
```
- `npc-ships.ts:85-125`: `compileNpcShips(catalogue, masses)` builds `candidate` with `mass: masses.get(key)`; add `radius: radii.get(key)`; failure surfaces as `<key>.radius` through `NpcShipSchema`.
- `ship-npc.ts:36`: `mass: z.number().positive(),` add `radius: z.number().positive(),` (strictObject, so the schema, generated JSON and `tests/content/ships-npc.test.ts`, `tools/oolite-ingest/convert/npc-ships.test.ts`, `ship-mass.test.ts` all change together). Regenerate with `docker compose run --rm assets`; gate with `assets:check`. Oolite: radius = max vertex distance from the mesh origin (read `ShipEntity.m` / `OOMesh` bounding radius; subentity rule per Oolite checkout). No new asset file, so `ASSETS.md` needs no row, but record provenance in the DATA-11 note.

### `src/app/session/world-lifecycle.ts` and `start-session.ts` (WORLD-14, SAVE-08)

**Analog (seam):** `world-lifecycle.ts:77-87` and 129-140:
```typescript
export type Populate = (world: World, options: { readonly traffic: boolean }) => void;
export const populateNothing: Populate = () => undefined;
...
const populate = options.populate ?? populateNothing;
```
`begin`/`resume` run `populate` right after `createWorld(worldSeedFor(marketSeed, worldEpoch))`, then read `anchorNextEntityId = created.store.nextId` (lines ~140-182). Wire a closure at `start-session.ts:305` (`createWorldLifecycle({...})`) that reads `ctx.core.layout` at call time (already set before `begin`) and the NPC records loaded at start-up (only when traffic is on; `loadNpcCatalogue()` from `src/content/ships-npc.ts`, never await inside `begin`). `populateInertWorld` must be total (rule (ii)). SAVE-08 tests compare `serializeWorldSection` (serialize.ts:111) fresh arrival vs `restoreWorldAnchor`, and `store.nextId` to the saved `nextEntityId`; mismatch does not reject the save. `tests/helpers/tick-script.ts:123` (`createWorldLifecycle({ traffic: options.traffic === true })`) must receive the same populate and records (`readFileSync`, no `import.meta.glob`).

### Build-time traffic default (WORLD-16, decision 1)

**Analog:** `vite.config.ts:69-72` declares `define: { __WEGOLITE_TEST_SEAMS__: "false" }`; `vite.seams.config.ts` uses `mergeConfig(base, { define: { __WEGOLITE_TEST_SEAMS__: "true" }, build: { outDir: "node_modules/.wegolite-seams" } })`; `src/main.ts:59` declares `declare const __WEGOLITE_TEST_SEAMS__: boolean;`. Copy this: add `__WEGOLITE_TRAFFIC_DEFAULT__` (default production `true`) declared where `test-flags.ts` reads it, and change `test-flags.ts:32` from `traffic: hook ? params.get("traffic") === "1" : true` to use the define as the non-hook default. The e2e, verify and verify-full compose services (compose.yaml:46-61, 92-130) run `npm run build` first: give them an env or a dedicated build script (for example a `build:e2e` that sets the define via an env-driven `define` in `vite.config.ts` or a second config) so production `npm run build`/`preview` keeps traffic ON. `tests/app/session/test-flags` unit tests and `tests/e2e/probe-shape.spec.ts` (frozen probe keys) need a read. Note the design risk to flag to the planner: the verify build must not be the one deployed.

### `src/app/session/frame-loop.ts` (WORLD-11)

**Analog (current chart branch, lines 112-121):**
```typescript
if (ctx.chart.chartOpen) {
  currentInput.drainCommands();
  currentInput.drainStationActions();
  pending.length = 0;
  ctx.core.currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
  redrawGate.request();
  updateProbe();
  return;
}
```
Amend: when `currentState.mode === "inFlight"` and not paused, step with no commands and a zero frame (`simDriver.advanceBehind(delta)`), skip render. Close the chart on `docked` / `hyperspaceJumped` (`hyperspace-controller.ts:~234` clears `chartSelectedId` only today). `sim-driver.ts:238-257` `advanceTicks` refuses with chart open: allow in flight. Tests to edit: `tests/app/session-order.test.ts:941-964`, `tests/app/session/sim-driver.test.ts:725-733` (exactly four `pending.length = 0;`), `chart-controller.test.ts`, `start-session.test.ts`; e2e `tests/e2e/hyperspace.spec.ts:252-257` becomes `toBeGreaterThan(frozenClock)`.

### `src/render/bodies/npc-ships.ts` (new `NpcLayer`) (WORLD-15)

**Analog:** `src/render/bodies/ship.ts` (player model path, shares cached geometry; use no `cloneMaterials`) and `buoy.ts:1-60` for the scene-owned body pattern (imports `three`, `GLTF` type, `isMesh, meshMaterials` from `../mesh.js`; disposes only what it owns):
```typescript
import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { isMesh, meshMaterials } from "../mesh.js";
```
Use one `InstancedMesh` per (model, primitive) with cached geometry/material, capacity `MAX_ENTITIES` (256), `setUsage(THREE.DynamicDrawUsage)`, `frustumCulled = false`, `visible = false` at count 0, matrices via `cameraRelative` (`src/render/camera-relative.ts`, same path as `sync.ts`). Models via `assets.loadNpcModel(glb)`. Create in `createSystemScene`, dispose in the scene registry (dispose only the `InstancedMesh`, never cached geometry or textures). Id-free contact snapshots from `src/sim/world/contacts.ts` (no `EntityId`, no import of `ids.ts`; `tests/guards/entity-id-scope.test.ts` enforces). Budget: 13 calls worst case (23 of 50 in flight); assert counts in the opt-in spec only, never milliseconds.

### `tests/e2e/` traffic spec (WORLD-16)

**Analog:** `tests/e2e/budget.spec.ts:204-250` (cold-start spec, must pass unchanged with traffic off) and the 7 `"/?test=1"` specs for the hook style. New spec uses `page.goto("/?test=1&traffic=1")` and asserts `probe.sim.entities > 0`, `hud.contacts`, and `calls <= 50` using only existing probe fields (probe shape is frozen).

## Shared Patterns

### Deterministic sim rules
**Source:** `eslint.config.js` (src/sim bans), AGENTS.md. No `Math.random`, `Date`, DOM or Three in `src/sim`; draws only through `rngNext` over hashed states.

### Per-world id scope
**Source:** `tests/guards/entity-id-scope.test.ts`. Nothing outside `src/sim` names `EntityId`. Every new id holder needs a Key Decisions row; this design has none (render layer is id-free).

### Unrouted event kinds
**Source:** `src/app/session/event-router.ts` (~380: "An unrouted kind ... is ignored"). `aiFaulted` is emitted and not routed; `torusRefused` is routed.

### Test and gate policy
Vitest coverage thresholds on `src/sim/**` (lines 93, statements 91, functions 97, branches 86 in `vitest.config.ts`): new sim modules need real tests. Pure-logic plans: `test`, `lint`, `typecheck` only (owner memory: skip verify on this slow machine); render/frame-loop plans need `verify`, and `verify-full` at phase end. All runs in Docker.

### Docs and decisions
Key Decisions rows in `PROJECT.md`: amend D-05 wording (D-01), integrator row (d) (D-02), below-24fps decision (D-03), AI fault rule (D-04), id-holder rule, traffic build default. `CHANGELOG.md` under `[Unreleased]` in the same commit.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/sim/world/placement.ts` (Oolite cylinder/shell samplers) | utility | transform | No existing seeded geometric sampler; port from `Universe.m` `locationByCode` (1783-1840) and `OOHPVector.m:75-114` using `layout.ts` constants |
| `src/render/bodies/npc-ships.ts` instancing | render | streaming | No `InstancedMesh` anywhere in `src/render` (only planet, atmosphere, nebula bodies use custom programs); use the three docs and RESEARCH Pattern 5 |

## Metadata

**Analog search scope:** `src/sim`, `src/app/session`, `src/render/bodies`, `src/content`, `tools/oolite-ingest`, `vite*.config.ts`, `compose.yaml`, `tests`.
**Files scanned:** about 25 read or grepped; RESEARCH lines 403-518 (open questions) were not read, so owner decisions in the prompt take precedence.
**Pattern extraction date:** 2026-11-14
