# Phase 18: Stations, Buoys and Collisions - Pattern Map

**Mapped:** 2026-11-19
**Files analyzed:** 17 (new or modified)
**Analogs found:** 15 / 17 (collision resolver and drift braking have partial analogs only)

All analog paths below were checked on disk and live in tracked source (`src/`, `tools/`, `tests/`); no gitignored mirror paths are used.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `tools/oolite-ingest/convert/ship-hulls.ts` (modify: add Coriolis, buoy, barrel, plate keys) | build converter | batch/transform | itself (`HULL_SHIP_KEYS`, `compileShipHulls`, `emitShipHulls`) | exact |
| `src/content/schemas/ship-hull.ts` (modify: size gates, subentity records) | config/schema | transform | itself (`MAX_HULL_NODES`, `MAX_HULL_ARTIFACT_BYTES`) | exact |
| `src/content/generated/ships-hulls.json` + `tests/golden/content/ships-hulls.json` (regenerate, or new lazy file for Coriolis) | generated artifact + golden | batch | itself; `src/content/ships-hulls.ts` loader | exact |
| `src/content/ships-hulls.ts` (modify or add sibling lazy loader) | loader | request-response (lazy) | itself | exact |
| `tests/content/ships-hulls.test.ts` (extend) | test | transform | itself | exact |
| `src/sim/combat/hit.ts` (extend candidates: statics, debris; subentity branch) | service | request-response | itself (`firstShipHit`, `HitTarget`, `HullTable`) | exact |
| `src/sim/combat/ident.ts` (extend `firstEntityTargetedByPlayer`, `isValidTarget`) | service | request-response | itself | exact |
| `src/sim/combat/step.ts` (`resolveShotHits` target list; remove "statics are never candidates") | service | event-driven | itself, lines 340-430 | exact |
| `src/sim/combat/ledger.ts` (collision records, buoy health, static target) | service | CRUD | itself (`HitRecord`, `applyLedger`) | exact |
| `src/sim/world/collide.ts` (NEW: collision stage, `collideWithShip` port, pair resolution) | service | batch | `src/sim/world/debris.ts` `blast()` (velocity push) + `ledger.ts` (records) | partial |
| `src/sim/world/debris.ts` (modify `blast` to push ships and the player, D-03) | service | transform | itself, lines 589-640 | exact |
| `src/sim/world/step.ts` (collision stage after movement, before ledger) | service | batch | itself, `stepWorld` line 75-140 | exact |
| `src/sim/world/entity.ts` / `world.ts` / `serialize.ts` / `sanitize.ts` / `snapshot.ts` (buoy destroyed state, drift) | model | CRUD | the `staticHealth` field, same files | exact |
| `src/sim/hyperspace/countdown.ts` + `src/sim/world/ship-field.ts` (buoys block jumps, D-09) | service | request-response | `isWitchspaceBlocked`, `createShipField.blocks` | exact |
| `src/sim/world/aegis.ts` (compass for destroyed buoy, D-05) | utility | request-response | itself, `resolveCompassTarget` | exact |
| `src/sim/flight/step.ts` (player drift, braking) | service | transform | `src/sim/world/step.ts` NPC integration; no player drift today | partial |
| Tests: `tests/sim/world/collide*.test.ts`, `tests/oracles/collide/**`, hash pins, cadence, `tests/e2e/hyperspace-failure.spec.ts` (one sanctioned fixture edit) | test | n/a | see Test Patterns | role-match |

## Pattern Assignments

### Hull artifact build: `tools/oolite-ingest/convert/ship-hulls.ts` (converter, batch)

**Analog:** itself. New keys are added to the key list; the compile loop is reused unchanged.

**Key list pattern** (lines 38-57):
```typescript
export const PLAYER_HULL_KEY = "oolite_template_cobra3-player";
export const HULL_SHIP_KEYS: readonly string[] = [
  PLAYER_HULL_KEY,
  ...NPC_SHIP_KEYS,
];
function fail(key: string, file: string, detail: string): never {
  throw contentError("SCHEMA", file, key, { excerpt: detail });
}
```

**Core pattern** (lines 70-102): each key goes catalogue entry -> `MODELS_DIR/entry.model` -> mesh -> `buildOctree(mesh, file)` + `hullRadius(key, file, mesh)` -> `ShipHullCatalogueSchema.safeParse`. Failures go through `fail(...)`. The Coriolis hull needs the same call plus its subentities (D-01 discretion). Measure node count and bytes first (the first plan, `assets` container).

**Emit pattern** (lines 126-150): hand-written canonical layout with each octree `root` as one compact line. It is sized against `MAX_HULL_ARTIFACT_BYTES` (200,000 bytes) and `MAX_HULL_NODES` (16,384 per the context). If the Coriolis does not fit, copy `emitShipHulls` into a second emitter and a second lazy loader (see below). Do not raise the ceilings silently.

**Companion test:** `tools/oolite-ingest/convert/ship-hulls.test.ts`.

### `src/content/ships-hulls.ts` (loader)

**Analog:** itself (lines 23-62). Lazy, non-eager glob, `?raw`, parse, then strict schema validation:
```typescript
const lazyShipHulls = import.meta.glob("./generated/ships-hulls.json", {
  query: "?raw",
  import: "default",
});
let cachedCatalogue: Promise<ShipHullCatalogue> | undefined;
export function loadShipHulls(): Promise<ShipHullCatalogue> {
  cachedCatalogue ??= (async () => { /* load -> JSON.parse -> safeParse, throw with path on failure */ })();
  return cachedCatalogue;
}
```
The module name must keep the `ships` prefix: the sim ESLint rule bans `**/content/ships*` imports, so `src/sim` sees hulls only as a caller-supplied `HullTable`. A separate Coriolis file must follow the same naming and be added to the same guards.

### `tests/content/ships-hulls.test.ts` (test)

**Analog:** itself. Cases to extend: strict schema parse, the exact key set (lines 14-16, 41-52 use `HULL_SHIP_KEYS`), the size gate (`MAX_HULL_*`), agreement with NPC radii, golden digest in `tests/golden/content/ships-hulls.json`, and "nothing on the boot path imports the loader" (`src/app/session/start-session.ts`). A mutation helper `withOctree` (lines 53-60) builds rejection cases. Regenerate the golden with the content build (`docker compose run --rm assets`) and check with `assets:check`.

### `src/sim/combat/hit.ts` (laser hit: statics and debris as candidates)

**Analog:** itself. `HitTarget` is `{ id, specKey, position, orientation }`; targets without a hull in the `HullTable` are skipped ("not loaded"). So adding statics (ids 1-5) and pods and plates is mostly new `HitTarget` rows plus hull keys.

**Stage A/B core** (lines 91-141): bounding-sphere test in the laser frame, then `toOoliteModelSegment` + `isHitByLine`, nearest-wins with `hit > 0 && hit < nearest`.

**Gap:** the module header (lines 17-19) says the subentity branch (`Universe.m:5560-5568`, `:5623-5636`) is NOT ported. Phase 18 ports it for the Coriolis. Add it inside the per-target loop after stage B, next to the existing `hit < nearest` accept. Cite Universe.m lines, as the file does everywhere.

### `src/sim/combat/step.ts` `resolveShotHits` (candidate list)

**Analog:** itself, lines 365-402. Candidate assembly:
```typescript
const targets: HitTarget[] = [];
if (combat !== undefined && (player.mode === "launching" || player.mode === "inFlight")) {
  targets.push({ id: PLAYER_ID, specKey: PLAYER_HULL_KEY, position: player.position, orientation: player.orientation });
}
if (world !== undefined && worldStepped) {
  for (const entity of world.store.live) {
    if (entity.dead || entity.kind !== "ship") continue;
    targets.push({ id: entity.id, specKey: entity.specKey, position: entity.position, orientation: entity.orientation });
  }
}
```
Extend: also push cargo (pods, plates; `canCollide` true, wrecks excluded, D-07), and the station and live buoys from `SystemLayout` with fixed ids 1-5. The comment at lines 349-352 and 413-416 ("station and buoys are never candidates", missedShots counts as miss) must be rewritten in the same commit. Keep the byte-for-byte ascending-id order.

### `src/sim/combat/ident.ts` (ident lock on statics and debris)

**Analog:** itself. `isValidTarget` (lines 62-72) rejects anything not `kind === "ship"`; `firstEntityTargetedByPlayer` (lines 86-125) iterates `world.store.live` where `kind !== "ship"` is skipped and says "The station and the buoys are static entities and never candidates". Both need the broader candidate set, `canCollide` gating (D-07, `Universe.m:5691`), and the strict `<` first-wins tie rule. Note the tripwire todo `2026-11-19-player-ident-lock-in-target-targets-self.md`.

### `src/sim/combat/ledger.ts` (collision records, static buoy health)

**Analog:** itself.

**Record shape** (lines 49-56): `HitRecord { target, source, amount, sourcePosition }`. Keep `sourcePosition` a copy at queue time (carry-over).

**Core loop** (lines 91-141): iterate records in order; player target goes through `routeDamage` and is never lethal; other targets must be `world.store.get(id)` with `kind === "ship"`, so a static or debris target is skipped today. Extend with: (a) a buoy target writing `world.staticHealth.<field>` and reporting a destroy; (b) debris targets (cargo kind) lowered by energy; (c) apply-all-then-decide-lethality (keep). The skip rule "missing, dead, static or not a ship" in the header changes accordingly.

**Total rule:** never throw; skip non-finite or non-positive amounts (line 94).

### `src/sim/world/collide.ts` (NEW; collision stage)

**Analog (partial):** the velocity push in `debris.ts` `blast()` and the record queueing in `ledger.ts`. There is no existing pair-resolution code.

**Push pattern from `blast`** (`debris.ts:607-640`): per live piece, `p2 = piece.position - origin`, `normalizeVec`, `dv = moment / mass`, write `piece.velocity = clampDebrisVelocity(...)`. Reuse `clampDebrisVelocity` and `normalizeVec` semantics for `adjustVelocity`. Constants live as named exports with Oolite line citations (`BLAST_MOMENTUM_FACTOR = 0.125`, `BLAST_RANGE_FACTOR = 2.5`, `BLAST_MIN_DISTANCE_SQUARED = 0.1`, lines 262-271). Do the same for the collision constants (1 m/s early return, `/ 50000000`).

**Structure to copy:** iterate in ascending id over a length snapshot (`stepWorld`, `const n = world.store.live.length`), once-per-pair (lower id first), no allocation inside the loop, total (skip non-finite). Emit `HitRecord`s into the ledger rather than mutating energy in place (damage is applied after, in `applyLedger`).

**Port the right half:** `collideWithShip` at `ShipEntity.m:11020-11140`, damage `m_other * v2b^2 / 50000000` (PITFALLS 12).

### `src/sim/world/debris.ts` `blast` (D-03: push ships and the player)

**Analog:** itself. Today the filter is `piece.kind !== "cargo" && piece.kind !== "wreckage"` (line 621) and the doc comment (lines 600-605) records that ships and the player are never pushed (D16-04, OC-4). Change the filter to include ships, the player, and add the player push through a returned vector or a callback (the player is not in the store). Keep the mass lookup `debrisMassOf` for debris and use the ship field mass for ships. Rewrite that doc comment and the Key Decisions row in the same commit. Existing pin: `tests/sim/world/debris.test.ts`, `debris-cadence.test.ts`.

### `src/sim/world/step.ts` (stage placement)

**Analog:** itself. In `stepWorld` (lines 80-140) the order is steer each ship -> `stepDebris` (drift integration: "Ships are not integrated: their velocity stays zero until Phase 18") -> think/AI drain. The collision stage goes after movement and before the ledger runs (the ledger runs after the world step in `combat/step.ts`). The comment about ships not being integrated must change: NPC ships now integrate `Entity.velocity` drift and brake by `SHIP_THRUST_FACTOR * thrust` (D-02).

### Static health, destroyed-buoy state, drift (model)

**Analog:** the `staticHealth` field end to end. Touch the same files in the same pattern.

- `world.ts:141-187`: `staticHealth: StaticHealth`, `createStaticHealth()`, `isPristineStaticHealth()`.
- `serialize.ts:174-181, 228-250`: label `staticHealth:` printed only when non-pristine (`pristine-omit`), after the world section and before the combat line. New state (destroyed buoy, drift) must print only when non-default so the pinned hashes hold:
```typescript
sanitizeStaticHealth(world);
if (!isPristineStaticHealth(world.staticHealth)) {
  text += `\n${serializeStaticHealth(world.staticHealth)}`;
}
```
- `sanitize.ts:753-767` repair in place; `snapshot.ts:503-517, 1156-1221, 1269` write/parse with `requireFinite` and `noNegativeZero`. A destroyed buoy can be represented as energy 0 with the existing field, so prefer no new snapshot field (saves never carry world state anyway, D-04). The player drift vector joins the flight state and its serializer with the same omit-when-zero rule; check `serializeFlight`.

### Buoy jump blocking (D-09)

**Analog:** `isWitchspaceBlocked` (`countdown.ts:81-91`) and `createShipField.blocks` (`ship-field.ts:100-120`).
```typescript
export function isWitchspaceBlocked(distanceSquared, stationMass, scannerRange): boolean {
  return WITCH_BLOCK_K * stationMass > distanceSquared && distanceSquared < scannerRange * scannerRange;
}
```
Both buoys join through `witchspaceBlockedAt(shipPosition, stationPosition, mass, scannerRange)` with mass 698,691.1875; a destroyed buoy contributes nothing. `WitchspaceBlocker` (`"station" | "ship"`) is a payload-free kind; add a `"buoy"` value rather than an id. Test analog: `tests/sim/hyperspace-blockage.test.ts`, `tests/sim/world/ship-field.test.ts`.

### Compass for a destroyed buoy (D-05)

**Analog:** `aegis.ts:66-100` `nextCompassMode` and `resolveCompassTarget`. The current resolver returns `"witchpoint"` unconditionally. Add the destroyed-buoy fallback, ported from Oolite with citations (researcher output), keeping the function pure and total. Test analog: its existing aegis test file.

### Player drift (partial)

No player drift exists. Closest: `src/sim/flight/step.ts` (player integration) plus the NPC `Entity.velocity` field from snapshot v4. Copy the pristine-omit and 30/60/144 Hz equality rules; port `PlayerEntity.m:3372-3405`.

## Test Patterns

**Independent oracle (`tests/oracles/`).** Existing tree is `tests/oracles/npc/{fire,fire-sites,pursuit,reference,fixtures}` with `schema.ts` and `reference.self.test.ts`. Pattern: strict zod schema for fixtures (`OracleFixtureSchema`), JSON fixtures with `file:line` citations into the Oolite checkout, a reference implementation in the oracle tree itself (float32 emulation), and a self-test that proves the oracle before the port exists. Add `tests/oracles/collide/` (octree fixtures for the dock-mouth subentity rule, collision damage and velocity cases) in the same shape.

**Independence guard** `tests/guards/oracle-independence.test.ts`: every `.ts` under `tests/oracles` may import only `node:` built-ins, `zod`, `vitest`, or relatives staying inside `tests/oracles`; `src/` paths in fs/path calls are refused. The new oracle tree must pass this without edits to the allow-list. Port-vs-oracle comparison tests live outside the tree (see `tests/sim/npc/fire-sites.oracle.test.ts`) and import both.

**Hash pins and cadence.**
- `tests/sim/world/flight-hash-pins.test.ts` + `tests/golden/world/flight-hash-pins.json`: pristine-omit proof (success criterion 5). Never regenerate; a moved hash is a failure.
- `tests/sim/world/world-cadence.test.ts` and `debris-cadence.test.ts`: one tick-indexed scenario, hash must be equal at 30, 60 and 144 Hz (copy the tick-indexed log, never frame-indexed). Add a collision scenario in this shape.
- `src/sim/cadence.test.ts`: `replay(hz)` over `runToSteps` with a per-tick `SCRIPT`.

**Other test analogs:** `tests/sim/combat/hit.test.ts`, `ledger.test.ts`, `ident.test.ts`, `kill.test.ts`, `tests/sim/world/debris.test.ts`, `snapshot-codec.test.ts`, `sanitize.test.ts`, `hash.test.ts`. Guards that may need updates: `tests/guards/ship-hit-consumers.test.ts`, `kill-credit-consumers.test.ts`, `entity-id-scope.test.ts`.

**Browser spec (one sanctioned edit):** `tests/e2e/hyperspace-failure.spec.ts`. Move the fixture pose outside the buoy hull and the 264.3 m blockage radius (D-06). Add a unit test that no arrival or launch pose overlaps a buoy hull (analog: `tests/sim/world/placement.test.ts`).

## Shared Patterns

### Pristine-omit hashing
**Source:** `src/sim/world/serialize.ts:228-250` plus `isPristineStaticHealth` in `world.ts`. Every new piece of hashed state must print only when non-default and be repaired by a sanitiser before printing.

### Damage only through the ledger
**Source:** `src/sim/combat/ledger.ts`, `src/sim/world/kill.ts`. Queue `HitRecord`s, apply all, then decide lethality; kill only through `killShip(world, id, killer, events, debris?)`, which is idempotent and normalises the killer. Player energy floors at 0 (`routeDamage`); no player death until Phase 20.

### Totality
**Source:** `ledger.ts` header (D-15), `kill.ts`. Never throw on a missing, dead, static or non-finite input; skip it.

### Citations
**Source:** every constant in `debris.ts` 147-271 carries an Oolite `File.m:line` comment. New constants must too.

### Sim purity and lazy hulls
`src/sim/**` imports no Three.js or DOM, and never imports `src/content/ships*`; hull data arrives as a `HullTable` through step options (`options?.combat?.hulls`). New hull keys must be added to the table builder in `tests/helpers/hull-table.ts` and the app wiring in `src/app/session/start-session.ts`.

### Docs updated in the same commit as the rule
PROJECT.md Key Decisions rows to supersede or amend (listed in CONTEXT), FIDELITY E-22, CHANGELOG `[Unreleased]`, `NOTICE`/`ASSETS.md` for any newly vendored model, and `third_party/oolite/CHECKSUMS.sha256` (tracked; keep honest).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/sim/world/collide.ts` pair resolution (octree against octree) | service | batch | No existing octree-vs-octree test; only ray-vs-octree (`octree.ts` `isHitByLine`). Use RESEARCH and `ShipEntity.m:11020-11140`. Broad-phase and pair cost per PITFALLS 17. |
| Player drift integration | service | transform | The player flight has no external velocity; NPC `Entity.velocity` is the nearest model. |
| Debris `HullTable` entries for pods and plates | content | batch | `ships-debris.json` holds debris models but no octree hulls; extend the hull converter (`tools/oolite-ingest/convert/debris.ts` is the source of the debris models). |

## Metadata

**Analog search scope:** `src/sim/{combat,world,hyperspace}`, `src/content`, `tools/oolite-ingest/convert`, `tests/{content,guards,oracles,sim,golden}`
**Files read:** about 14 (hit.ts, ledger.ts, kill.ts, countdown.ts, ship-field.ts, ship-hulls.ts converter, ships-hulls.ts loader, serialize.ts excerpt, debris.ts blast excerpt, ident.ts excerpt, aegis.ts excerpt, step.ts excerpts, test headers)
**Pattern extraction date:** 2026-11-19
