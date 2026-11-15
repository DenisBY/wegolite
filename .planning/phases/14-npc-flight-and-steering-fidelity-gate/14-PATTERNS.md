# Phase 14: NPC Flight and Steering Fidelity Gate - Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 22 (new or modified groups)
**Analogs found:** 20 / 22 (2 partial)

All analog paths below were checked as git-tracked (`git ls-files`) or sit under tracked `src/`, `tests/`, `tools/`. None is a gitignored mirror.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/sim/npc/constants.ts` | config (ledger) | transform | `src/sim/combat/constants.ts` | exact |
| `src/sim/npc/state.ts` (FlightComponent, factory, sanitize) | model | CRUD | `src/sim/world/entity.ts` + `src/sim/world/sanitize.ts` (Phase 13 energy bank) | exact |
| `src/sim/npc/flight.ts` (sticks, attitude, thrust) | utility | transform | `src/sim/flight/attitude.ts` (quat composition only) | role-match |
| `src/sim/npc/track.ts`, `tracking-curve.ts`, `proximity.ts` | utility | transform | `src/sim/combat/aim.ts`, `src/sim/world/ship-field.ts` (linear live walk) | role-match |
| `src/sim/npc/dispatch.ts` (steerShip) | service | request-response | `invoke`/loop in `src/sim/world/step.ts` | role-match |
| `src/sim/npc/behaviours/*.ts` | utility | transform | `src/sim/ai/pilots/test-pilot.ts` (reads view, writes ctl) | partial |
| `src/sim/world/step.ts` (replace placeholder, add options param) | service | event-driven | itself, lines 70-103 | exact |
| `src/sim/world/entity.ts`, `serialize.ts`, `snapshot.ts`, `sanitize.ts`, `limits.ts` (flight record, snapshot v3) | model | CRUD | Phase 13 energy-bank edits in the same files | exact |
| `src/sim/world/view.ts` / `view-impl.ts` (`radius` on `BodyView`) | provider | request-response | itself | exact |
| `src/sim/ai/types.ts` (`flight-script` key, new event names) | config | event-driven | `AI_KEYS`, `AI_EVENT_NAMES` | exact |
| `src/sim/ai/pilots/flight-script.ts` | controller (AI module) | event-driven | `src/sim/ai/pilots/test-pilot.ts` | exact |
| `src/sim/ai/registry.ts` | config | n/a | itself (register new key) | exact |
| StepOptions `npcFlight` table: `src/sim/flight/step.ts`, `src/app/session/step-options.ts`, `src/sim/sim.ts` | config | request-response | `shipMasses` path (`ship-field.ts`, `step-options.ts`) | exact |
| `src/content/schemas/ship-npc.ts`, `tools/oolite-ingest/convert/npc-ships.ts`, `src/content/generated/ships-npc.json` (flight fields) | model/config | batch | Phase 13 `maxEnergy`/`forwardWeapon` fields in the same files | exact |
| `tests/oracles/npc/**` (schema, fixtures, reference, runner) | test | transform | `tests/sim/world/control.test.ts` (rule-derived expectations); `tests/helpers/hull-table.ts` (fixture loading) | partial |
| `tests/guards/oracle-independence.test.ts`, `harness-isolation.test.ts` | test (guard) | file-I/O | `tests/guards/content-boundary.test.ts`, `tools-determinism.test.ts` | role-match |
| `tests/acceptance/npc-flight.acceptance.test.ts`, `thresholds.ts` | test | batch | `tests/sim/world/world-cadence.test.ts` + `tests/helpers/traffic-fixture.ts` | role-match |
| `tests/sim/npc/*.test.ts` (table, property) | test | transform | `tests/sim/world/snapshot-codec.test.ts` (fast-check, per-field tables) | role-match |
| `tests/sim/world/world-cadence.test.ts` (extend) or `tests/sim/npc/npc-cadence.test.ts` | test | event-driven | `tests/sim/world/world-cadence.test.ts` | exact |
| `tools/ai-harness/{load,host,dist-check}.ts` + tests | utility | file-I/O | `tools/oolite-ingest/drift.test.ts`; `tests/contract/fidelity.test.ts` (`OOLITE_SRC` skipIf) | partial |
| `check:dist` script + `compose.yaml` verify chain | config | batch | `compose.yaml` verify lines 96-119 (`assets:check` step) | role-match |
| `tests/e2e/npc-flight.spec.ts` | test (browser) | request-response | `tests/e2e/traffic.spec.ts` | exact |
| test-hook member + `tests/fixtures/probe-shape.json` | provider | request-response | `spawnTestShooter` in `src/app/probe.ts`, `probe-publisher.ts`, `src/sim/ai/test-spawn.ts` | exact |
| Re-pinned goldens/tests (`inert-lave-epoch1.json`, `control.test.ts`, `view.test.ts`, Pitfall 8 list) | test | n/a | Phase 13 plan 13-07 procedure | exact |

## Pattern Assignments

### `src/sim/npc/constants.ts` (config ledger)

**Analog:** `src/sim/combat/constants.ts`

Header convention (lines 4-27): module doc stating every number carries an Oolite file:line, "a number that plays badly is a finding, not a tweak", imports only `../ai/time.js` and math types, no content. Each constant is a frozen record or `export const` with a doc comment citing `ShipEntity.h:46` and so on. Conversion helpers use `TICKS_PER_SECOND` (`import { TICKS_PER_SECOND } from "../ai/time.js"`, line 23). The tracking-curve gate is `round(reactionTime/3 * TICKS_PER_SECOND)` = 60. Pin it with a `tests/sim/npc/constants.test.ts` like `tests/sim/combat/constants.test.ts`. Constants to copy come from RESEARCH "Constants (verbatim)".

### `src/sim/npc/state.ts` and the world-record edits (flight record, hash, snapshot v3)

**Analog:** Phase 13 energy bank, in these files:

- `src/sim/world/entity.ts:50-58` (new fields with doc comment "Hashed, snapshotted and repaired like every other field"); `SpawnInit` optional keys with defaults at lines 72-75.
- `src/sim/world/serialize.ts:110` (append one segment; do not reorder):
  ```typescript
  `en:${canon(entity.energy)},${canon(entity.maxEnergy)},${canon(entity.energyRechargeRate)}`,
  ```
  Add `fl:` the same way, using `canon` for floats and `int` for ids and ticks.
- `src/sim/world/sanitize.ts` (header lines 4-36): `Cleaned<T>` helper, `noNegativeZero`, `isBounded`, `isUint32`; bounds come only from `./limits.js` ("this module declares and exports no constant"). Repairs count once per call. Add new flight bounds to `limits.ts`, never to `sanitize.ts`.
- `src/sim/world/snapshot.ts`: `EntitySnapshot` fields (~109-111), `requireFinite` (~220), `noNegativeZero` on emit (~295), strict key list (~605), `limitedNumber(read(o, ...))` (~652), restore mapping (~783). Bump `WORLD_SNAPSHOT_VERSION` 2 to 3 once and refuse version 2 (comment at ~67).
- `tests/sim/world/snapshot-codec.test.ts`: per-field `Record<keyof Entity, ...>` table fails typecheck until a row exists (RESEARCH Pattern 3).
- Golden: regenerate `tests/golden/world/inert-lave-epoch1.json` once via `tests/helpers/write-inert-world-golden.ts`; prove population draws unchanged by strip-and-rehash (see `.planning/phases/13-views-lasers-and-shields/13-07-SUMMARY.md`). Do not touch `tests/golden/world/flight-hash-pins.json`.

`flightSpeed` stays `Entity.speed`; `desiredSpeed`, `desiredRange`, `destination`, `behaviour`, `targetId` stay in `NavComponent` (`entity.ts:19-25`).

### `src/sim/npc/flight.ts` (applySticks, applyAttitude, applyThrust)

**Analog:** `src/sim/flight/attitude.ts:60-70`. Reuse only the quaternion composition and sign convention (pinned by test; do not fix the minus on roll):
```typescript
const roll = axisAngle(0, 0, 1, -state.rollRate * dt);
const pitch = axisAngle(1, 0, 0, state.pitchRate * dt);
state.orientation = normalize(mul(mul(state.orientation, roll), pitch));
```
Use helpers from `src/sim/math.ts`: `axisAngle`, `mul`, `normalize`, `rotate`, `add`, `scale`, `dot`, `cross`, `normalizeVec`, `clamp`, `moveToward`. Forward is local -Z: `const FORWARD = vec(0, 0, -1)` as in `step.ts:51`. Movement (replaces `step.ts:100-102`):
```typescript
const forward = rotate(entity.orientation, FORWARD);
entity.position = add(entity.position, scale(forward, entity.speed * dt));
```
Do not copy the player's ramped keyboard model (RESEARCH anti-pattern).

### `src/sim/npc/track.ts`, `tracking-curve.ts`, `proximity.ts`

**Analog:** `src/sim/world/ship-field.ts:77-121`: one linear walk over `world.store.live`, skip `dead`, inline squared distance, no allocation, no Map:
```typescript
const live = world.store.live;
for (let i = 0; i < live.length; i += 1) {
  const ship = live[i];
  if (ship === undefined || ship.dead) continue;
  const dx = ship.position.x - position.x; ...
```
Lookup of per-kind stats: copy `massOf` (lines 128-141): linear scan over a `readonly` list keyed by `specKey`, returns `undefined` unless finite and positive (T-12-10). Use the same for `statsFor(specKey)`.
Randomness: only `rngNext(createRngState(entity.rng.combat))` with write-back (`src/sim/rng.ts:19-40`); see the write-back-on-both-paths idiom in `step.ts:175-191` (`invoke`). Never `Math.random` (lint ban).

### `src/sim/npc/dispatch.ts` and the `step.ts` change

**Analog:** `src/sim/world/step.ts` itself.

- Signature to extend (lines 70-76): add an optional trailing parameter after `registry`, for example `npcFlight?: NpcFlightTable`. Thread from `stepSim` (`src/sim/sim.ts:105`: `events.push(...stepWorld(world, player, layout, dt));`).
- Replace lines 88-103 inside the same loop shape:
  ```typescript
  for (let i = 0; i < n; i += 1) {
    const entity = world.store.live[i];
    if (entity === undefined || entity.dead || entity.ai === null) continue;
    steerShip(...);
  }
  ```
  An entity with `ai === null` must keep holding its placement (D-02). The loop walks ascending ids over the length snapshot `n`.
- No try/catch in steering (header lines 21-26; native steering must be total, property-tested). Only `invoke` (lines 165-192) contains faults, and only for AI modules.
- Events to AI become queued: `postAiEvent` in `src/sim/world/world.ts:507-520` (delivered at the next drain, `step.ts:113`, `128`, `202-223`). Add event names (`shipFacingDestination`-style, safety reached, frustrated) to `AI_EVENT_NAMES` (`src/sim/ai/types.ts:55-77`).
- Sanitize loop (lines 130-135) already covers the new record once `sanitizeEntity` is extended.

### `src/sim/npc/behaviours/*.ts` and the `WorldView` host

**Analog:** `src/sim/ai/pilots/test-pilot.ts:70-102`, for reading through the view and acting through `ctl`:
```typescript
const own = view.ship(self);
const target = targetId === undefined ? undefined : view.body(targetId);
...
ctl.setDesiredRange(self, holdRange);
ctl.setDesiredSpeed(self, ...);
ctl.perform(self, "FLY_TO_DESTINATION");
```
Native behaviours do not use `ctl`; they write `entity.nav`/the flight record directly. Their input type is `WorldView` extended additively: add `readonly radius: number;` to `BodyView` (`src/sim/world/view.ts:27-34`) and to `view-impl.ts`; update the exhaustive `Record<keyof WorldView, true>` pin in `tests/sim/world/view.test.ts` deliberately. Synthetic oracle hosts implement the same interface. One file per behaviour with the Oolite line range in the header (RESEARCH structure). Out-of-scope `BehaviourId`s (`src/sim/world/ids.ts:68-108`): hold attitude, decay speed as IDLE, never throw; pin by test.

### `src/sim/ai/pilots/flight-script.ts` (+ `types.ts`, `registry.ts`)

**Analog:** `src/sim/ai/pilots/test-pilot.ts` (exact structure).

- Factory returning `AiComponent` with `aiKey`, `params`, `wakeTick: 0`, `nextThinkTick: tick` (lines 37-62). Params are `ParamValue` only (numbers, strings, finite arrays; `src/sim/ai/types.ts:40-41`). Script held as param arrays.
- `numberParam` helper (lines 64-68).
- `think` skeleton (lines 120-130): set `ai.nextThinkTick = view.tick + THINK_INTERVAL_TICKS`, then act, then `ctl.scheduleWake(self, ticks(...random()...))`.
- Export frozen module: `export const TEST_PILOT: AiModule = Object.freeze({ think });` (line 132).
- Register: add the key to `AI_KEYS` (`src/sim/ai/types.ts:19`, a closed list also enforced by `spawnEntity`, `sanitizeEntity`, snapshot parser) and to `AI_REGISTRY` (`src/sim/ai/registry.ts`). The populator never spawns it. Do not add `ShipControl` members (`tests/sim/world/control.test.ts` member pin).
- Spawn helper for the hook: copy `src/sim/ai/test-spawn.ts:51-82` (`spawnTestShooter`: `isScanClass` check, `spawnEntity({... ai, maxEnergy, energyRechargeRate }, tick).ok`).
- Tests: copy `tests/sim/ai/test-pilot.test.ts` and `test-spawn.test.ts`.

### `StepOptions` `npcFlight` table

**Analog:** the `shipMasses` path.

- Type: `ShipMass { specKey; mass }` and `massOf` in `src/sim/world/ship-field.ts:57-141`. New `NpcFlightStats { specKey; maxFlightSpeed; maxFlightRoll; maxFlightPitch; thrust }` with the same linear-scan lookup and finite-positive guard.
- Options plumbing: `src/sim/flight/step.ts:45-92` (`StepOptions`, optional `combat?: CombatOptions` and `hyperspace?`); add an optional `npcFlight?: readonly NpcFlightStats[]` and read it in `stepSim`.
- Builder: `src/app/session/step-options.ts:27-109`: optional input key `readonly shipMasses?: ...` and the "omit rather than set `undefined`" spread (`...(shipMasses === undefined ? {} : { shipMasses })`) because of `exactOptionalPropertyTypes`. The file must stay Node-importable (no DOM, no `import.meta.glob`).
- The sim never imports content (`tests/guards/content-boundary.test.ts`); a type-only import is allowed.

### Content flight fields (schema, ingest, golden)

**Analog:** Phase 13 additions.

- `src/content/schemas/ship-npc.ts:36-76`: `z.strictObject`, a doc comment per field citing the Oolite default (`max_flight_speed` 160, `max_flight_roll` 2.0, `max_flight_pitch` 1.0, `thrust` 15.0, `ShipEntity.m:263-270`).
- `tools/oolite-ingest/convert/npc-ships.ts:226-239`: `floatExtra(key, entry.extras, "max_energy", DEFAULT_MAX_ENERGY)` then the `NpcShipSchema.safeParse(candidate)` failure path. Add four `floatExtra` calls with the Oolite defaults. `like-ship.ts` already resolves `like_ship`.
- Never hand-edit `src/content/generated/`; regenerate with `docker compose run --rm assets`, check with `assets:check`.
- Tests: extend `tests/content/ships-npc.test.ts`; add an assertion that `accuracy`, `reaction_time`, `scanner_range` stay absent for all nine (the port relies on defaults).

### `tests/oracles/npc/**`

**Analog (partial):** `tests/sim/world/control.test.ts` header: "Expected values come from the rules of the plan and the shared limits, never from running the implementation." Fixture loading via `readFileSync(new URL(..., import.meta.url))` as in `tests/helpers/hull-table.ts:23-40`. Fixture schema is a `z.strictObject` (zod, as in `ship-npc.ts`). Reference maths must import nothing from `src/`; use `Math.fround` to emulate GLfloat. Structure per RESEARCH Pattern 6 and "An oracle fixture shape". Plan O's executor must not read `src/sim/npc/**`.

### `tests/guards/oracle-independence.test.ts`, `harness-isolation.test.ts`

**Analog:** `tests/guards/content-boundary.test.ts:1-60` (probe written under a source dir, linted, removed in `finally`; `REPO_ROOT = process.cwd()`; `spawnSync` gate runner) and `tests/guards/tools-determinism.test.ts:20-45` (`withProbe`, `lintProbe`, 30 s timeout). For a pure scan guard (import text of `tests/oracles/**`, `src/**`, `public/**`) use `readdirSync`/`readFileSync` over the tree; the lint-probe pattern applies only if a lint rule is added. Use `withProbeLock` from `./probe-lock.js` if a probe file is written into `src/`.

### `tests/acceptance/**`

**Analog:** `tests/sim/world/world-cadence.test.ts` (imports lines 29-70: `stepSim`, `DT`, `createWorld`, `hashWorld`, `entityHashes`, `realHullTable`, `laveFixture`) and `tests/helpers/traffic-fixture.ts:34-60` (`laveInertWorld(epoch)`, `poseNearFirstShip`; world seeded by `worldSeedFor(marketSeedForSystem("g0-s7"), epoch)`). Epochs 1..20 are the 20 seeds. Hull tunnelling detector: `isHitByLine`, `toOoliteModelSegment` (`src/sim/combat/octree.ts:435`, `457`) and `firstShipHit` (`src/sim/combat/hit.ts:71`) with `realHullTable()` (`tests/helpers/hull-table.ts`); station sphere `STATION_RADIUS = 500` (`src/sim/world/layout.ts:70`). Set explicit per-test timeouts. Commit `thresholds.ts` in an earlier commit than the first run.

### Cadence test (30/60/144 Hz)

**Analog:** `tests/sim/world/world-cadence.test.ts` (exact): tick-indexed log, never frame-indexed; own frame runner using `clampFrameDelta`, `MAX_STEPS_PER_FRAME`; `createTestPilotAi` is replaced by the flight-script pilot; step options built with `realHullTable()`, `realNpcWeapons` (`tests/helpers/npc-weapons.js`), plus the new flight table.

### `tests/e2e/npc-flight.spec.ts`

**Analog:** `tests/e2e/traffic.spec.ts:1-50`: opt-in by URL (`?test=1&traffic=1&clock=manual`), counts only (no milliseconds), `DRAW_CALL_BUDGET = 50`, helpers `waitForReady`, `startNewGame`, `inFlightSaveAt`/`writeRaw` (`tests/e2e/helpers/*`), `laveInertWorld`/`poseNearFirstShip`, `runTickScript`, `npcContacts`. Not part of `verify`; runs in `verify-full`. Run only on the remote machine.

### Test-hook member and probe-shape fixture

**Analog:** `spawnTestShooter` across four files (exact template):

1. `src/sim/ai/test-spawn.ts:51-82` (sim-side spawner).
2. `src/app/session/probe-publisher.ts:175-208` (`spawnShooter`: guard `liveState`, `disposed`, `mode === "inFlight"`, find record by key, `markHookMutation()` before touching the world, then call the spawner; member added to `simHook`).
3. `src/app/probe.ts:285-306` (interface member with doc comment on taint) and `probe.ts:550-554` (`if (!sim.x()) return false; hook.tainted = true; return true;`).
4. `tests/fixtures/probe-shape.json` rows at lines 1087 and 1304 (`"spawnTestShooter": "function"`): add the new member in both. Run `tests/app/probe-shape-compare.test.ts` and `tests/app/session/probe-publisher.test.ts`.

### `tools/ai-harness/**` and `check:dist`

**Analogs (partial):**
- `OOLITE_SRC` gating: `tests/contract/fidelity.test.ts:285-295` (`it.skipIf(OOLITE_SRC === "")(...)` with `readFileSync(join(OOLITE_SRC, excerpt.path))`). The remote machine has no checkout, so tests must skip and the report carries the transcript.
- Tools test placement: `tools/oolite-ingest/drift.test.ts` (inside the `unit` Vitest project via `tools/**/*.test.ts`). Tools code falls under the `tools-determinism` lint zone (`tests/guards/tools-determinism.test.ts`; `Math.sin`, `toFixed` banned in `tools/oolite-ingest/`): check `eslint.config.js` before assuming the same bans reach `tools/ai-harness/`, and where a ban applies use a scripted `Math.random` stub through the sandbox rather than the real global.
- `check:dist`: a post-build step. Pattern is the `assets:check` line in `package.json:15` (`"assets:check": "tsx tools/oolite-ingest/cli.ts --check"`) and the fail-fast chain in `compose.yaml:96-119`:
  ```
  npm run build:e2e &&
  npm run test:e2e:fast
  ```
  Insert `npm run check:dist &&` after `build:e2e` in both `verify` and `verify-full` (compose.yaml ~113-135), and the CI workflow. Non-vacuity test: a fixture dist containing a marker must fail (`tools/ai-harness/dist-check.test.ts`). `tests/compliance.test.ts` documents why a `dist/` read in Vitest cannot run (test precedes build).
- No analog in the repo for `node:vm`; use RESEARCH "Node vm loader" and Context7 docs when writing.

## Shared Patterns

### Deterministic randomness
**Source:** `src/sim/rng.ts:19-40`, `src/sim/world/step.ts:175-191`
**Apply to:** `src/sim/npc/**`, `flight-script.ts`. Draw only from `entity.rng.combat` (steering) and `ctx.random` (AI think). Copy the local `createRngState(entity.rng.x)` ... `entity.rng.x = stream.s` write-back.

### Pure sim zone
**Source:** `src/sim/world/ship-field.ts` header; `tests/guards/sim-purity.test.ts`, `sim-determinism-bans.test.ts`
**Apply to:** all `src/sim/npc/**`. No Three.js, no DOM, no content import (type-only door allowed), no `Math.random`, `Date`.

### Ledger with Oolite citations and licence header
**Source:** `src/sim/combat/constants.ts:1-27`
**Apply to:** every new `src/` file. Start with the two SPDX lines (`// SPDX-License-Identifier: GPL-2.0-or-later`, `// Copyright (c) 2026 Wegolite contributors`) and a module doc comment. Add FIDELITY.md rows in the format `tests/contract/fidelity.test.ts` checks (Wegolite cell `src/...:line`, Oolite cell `src/Core/...:a-b`, excerpt at most 20 lines, divergences quote a PROJECT.md Key Decisions row).

### Fault containment and totality
**Source:** `src/sim/world/step.ts:21-26`, `165-192`
**Apply to:** `dispatch.ts`, behaviours. Native steering has no try/catch by design; guard degenerate geometry literally per Oolite (`trackDestination` zero-vector guard, `ShipEntity.m:9493-9496`) and add clamps; the acceptance run asserts `repairs === 0`.

### Command seam pins
**Source:** `tests/sim/world/control.test.ts:34-40` (`Record<keyof ShipControl, true>`), `tests/sim/world/view.test.ts`
**Apply to:** anything touching `ShipControl`/`WorldView`: only `radius` on `BodyView` is added; no `ShipControl` member.

### Test scaffolding
**Source:** `tests/helpers/{traffic-fixture,hull-table,lave,npc-weapons,tick-script}.ts`
**Apply to:** all new sim, acceptance and cadence tests. Do not hand-build entity arrays.

### Taint on hook mutation
**Source:** `src/app/session/probe-publisher.ts:187-200`, `src/app/probe.ts:550-554`
**Apply to:** any new `?test=1` hook member.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tools/ai-harness/load.ts`, `host.ts` (`node:vm` stub host over AILib JS) | utility | file-I/O | No `vm` or JS-sandbox code exists; use RESEARCH Pattern 7 and Node docs |
| `tests/oracles/npc/reference/*.ts` (independent vector/quaternion maths with `Math.fround`) | utility | transform | Independence rule forbids reusing `src/sim/math.ts`; nearest conceptual precedent is Phase 5 hand-derived reference vectors (`.planning/STATE.md` ~line 275) |

## Metadata

**Analog search scope:** `src/sim/{world,ai,combat,flight}`, `src/app/{probe,session}`, `src/content/schemas`, `tools/oolite-ingest`, `tests/{sim,guards,helpers,e2e,contract,fixtures,golden}`, `compose.yaml`, `package.json`.
**Files read:** about 20 (full or targeted). `tests/oracles/`, `tests/acceptance/`, `src/sim/npc/`, `tools/ai-harness/` do not exist yet.
**Pattern extraction date:** 2026-11-15
