# Phase 13: Views, Lasers and Shields - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 27 new/modified
**Analogs found:** 27 / 27 (all paths verified git-tracked; none under a gitignored capability mirror)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/session/world-lifecycle.ts` (begin refusal clears world) | service | request-response | itself: `end()` / `resetForRestore()` lines 187-204 | exact |
| `src/app/session/event-router.ts` (IN-01 massLock wording) | provider | event-driven | itself, `torusRefused` case lines 258-264 | exact |
| `src/input/actions.ts` (+viewFore/Aft/Port/Starboard, fire, ident, untarget, eject; pause P only; targetStation to KeyQ) | config | request-response | itself (ActionId union, ACTION_IDS, DEFAULT_BINDINGS, ACTION_LABELS, ACTION_CONTEXTS) | exact |
| `src/input/bindings.ts` (drop Escape pair exemption) | utility | transform | itself `isExemptPair` lines 99-125 | exact |
| `src/settings/schema.ts` (legacy-default migration before `createBindingMap`) | utility | transform | `mergeDefaults` lines 257-262, `parseSettings` bindings loop 128-163 | role-match |
| `src/sim/combat/constants.ts` | config | n/a | `src/sim/flight/config.ts`; `src/sim/world/limits.ts` | role-match |
| `src/sim/combat/weapons.ts` | utility | transform | `src/sim/flight/speed.ts` (pure per-tick scalar step) | role-match |
| `src/sim/combat/shields.ts` | utility | transform | `src/sim/flight/speed.ts` / `src/sim/hyperspace/countdown.ts` | role-match |
| `src/sim/combat/octree.ts`, `hit.ts` | utility | transform | `tools/oolite-ingest/convert/octree.ts` (types, encoding) + `src/sim/dock/hull.ts` (sim-side geometry test) | role-match |
| `src/sim/combat/state.ts` (PlayerCombatState) | model | CRUD | `src/sim/flight/state.ts` + `src/sim/flight/sanitize.ts` | role-match |
| `src/sim/combat/step.ts` (stepPlayerCombat, resolveShots) | service | event-driven | `src/sim/dock/step.ts`, `src/sim/world/step.ts` | role-match |
| `src/sim/sim.ts`, `src/sim/flight/step.ts` (`StepOptions.combat`) | service | request-response | `StepOptions.hyperspace.shipMasses` lines 75-81 | exact |
| `src/sim/world/control.ts` + `control-impl.ts` (+`fire`) | service | request-response | itself: `setDesiredSpeed` | exact |
| `src/sim/world/entity.ts`, `sanitize.ts`, `serialize.ts`, `snapshot.ts`, `limits.ts` (energy fields) | model | CRUD | itself (`nav`, `rng` fields) | exact |
| `src/sim/commands.ts`, `src/sim/events.ts` (setView, laserFired, shipHit) | model | event-driven | existing `torusRefused`/`massLockChanged` events | exact |
| `src/sim/player/outfitting.ts` (+checkLaserFit/applyLaserFit) | service | CRUD | itself `checkFit`/`applyFit` lines 261-391 | exact |
| `src/persistence/save.ts` (v3 to v4, `laserMounts`) | model | CRUD | itself `SaveV3Schema`, `migrateV2ToV3` | exact |
| `tools/oolite-ingest/convert/ship-hulls.ts` (new) | utility | batch | `tools/oolite-ingest/convert/npc-ships.ts` + `ship-radius.ts` | exact |
| `tools/oolite-ingest/generate.ts` (emit hulls) | config | batch | itself line 37 / 189 `emitNpcShips` | exact |
| `src/content/ships-hulls.ts` (lazy loader) | service | file-I/O | `src/content/ships-npc.ts` | exact |
| `src/content/schemas/ship-hull.ts` | model | transform | `src/content/schemas/ship-npc.ts` | exact |
| `src/app/session/step-options.ts` (`combat` input) | utility | transform | itself, `shipMasses` pass-through | exact |
| `src/app/hud-model.ts` (shield/energy/LT/CT bars, identFrame) | utility | transform | itself `buildBars` lines 130-150 | exact |
| `src/render/hud/draw.ts` (feed placeholders) | component | request-response | itself `drawLeftGauges` 493-545, `drawFillGauge` 395-418 | exact |
| `src/render/launch-camera.ts` (4-view camera) | utility | transform | itself (`COCKPIT_OFFSET`) | role-match |
| `src/app/dock-feedback.ts` (message throttle for overheat/ident) | utility | event-driven | itself `shouldEmitScrapeMessage` lines 43-50 | exact |
| tests: `tests/sim/combat/*.test.ts`, `tests/content/ships-hulls.test.ts`, `tools/oolite-ingest/convert/ship-hulls.test.ts`, `tests/persistence/save-v4.test.ts` | test | n/a | `tests/content/ships-npc.test.ts`, `tests/persistence/save-v3.test.ts`, `tests/sim/world/ship-field.test.ts` | role-match |

## Pattern Assignments

### `src/app/session/world-lifecycle.ts` (FOUND-17)

**Analog:** itself. `begin` (lines 158-173) refuses with a bare `return;`, leaving the origin world and anchor installed. `end()` (187-190) is the clear idiom to copy:

```typescript
begin(marketSeed) {
  if (!Number.isFinite(marketSeed) || !Number.isSafeInteger(epoch) ||
      epoch < 0 || epoch >= MAX_LIVE_EPOCH) {
    return;            // <- bug: replace with the end() body, then return
  }
  const next = epoch + 1;
  const created = create(marketSeed, next);   // build first, commit after
  world = created; epoch = next; anchorNextEntityId = created.store.nextId;
},
end() { world = undefined; anchorNextEntityId = undefined; },
```
Keep "build first, commit after" so a throwing populator leaves state unchanged. Test: extend `tests/app/session/hyperspace-controller.test.ts` (`harness()`), `tests/app/session/world-lifecycle.test.ts`.

### `src/app/session/event-router.ts` (IN-01, one line)

**Analog:** lines 258-264 (`torusDisengaged` then `torusRefused` already uses "Hyperspeed mass-locked."). Add `event.reason === "massLock"` branch printing the same string; update `tests/app/session-order.test.ts:531`, `CHANGELOG.md:30`.

### `src/input/actions.ts`, `src/input/bindings.ts`, `src/settings/schema.ts` (INPUT-01)

**Analog:** `src/input/actions.ts`. Every new action needs five parallel edits: `ActionId` union (13-59), `ACTION_IDS` array (84-134), `DEFAULT_BINDINGS` (147-202), `ACTION_LABELS` (204-251), `ACTION_CONTEXTS` (309-359). Copy:
```typescript
pause: Object.freeze(["KeyP", "Escape"]),       // -> ["KeyP"]
launch: Object.freeze(["Digit1", "F1"]),        // viewFore needs same codes in "flight"; remove "flight" from launch contexts (line 320)
targetStation: Object.freeze(["KeyR"]),         // -> ["KeyQ"] (RESEARCH A3); ident takes KeyR
pitchForward: contexts("flight"),               // new flight-only actions follow this
```
Order matters for conflicts (see comment at 128-131: earlier-listed action wins on a persisted shared key).

**`src/input/bindings.ts` 99-125:** `isExemptPair` exists only because `pause` shared Escape with screen Back actions; delete or neutralise, with `ESCAPE_SCREEN_*` in actions.ts (66-82). Update tests listed in RESEARCH Pitfall 3.

**`src/settings/schema.ts`:** `mergeDefaults` (257-262) does `bindings: createBindingMap(settings.bindings)`; stored maps are authoritative (Pitfall 1). Add a pure `migrateLegacyBindings(bindings)` run before `createBindingMap` that rewrites only exact legacy defaults (`pause == ["KeyP","Escape"]` to `["KeyP"]`, `targetStation == ["KeyR"]` to `["KeyQ"]`). No version bump. Tests in `tests/settings/schema.test.ts`.

### `src/sim/world/control.ts` + `control-impl.ts` (`fire`)

**Analog:** itself. Type side (control.ts 24-33), add `fire(id: EntityId): void;` with doc. Impl (control-impl.ts):
```typescript
function actor(id: EntityId): Entity | undefined {
  return id === actorId ? world.store.get(id) : undefined;
}
setDesiredSpeed(id: EntityId, speed: number): void {
  const entity = actor(id);
  if (entity === undefined || !isNonNegativeBounded(speed)) return;
  entity.nav.desiredSpeed = speed;
},
```
`fire` sets a request flag on the actor only (resolved at one fixed point later, Pitfall 7/19); calls not addressed to the actor are ignored, never throw. Update the exhaustive `Record<keyof ShipControl, true>` in `tests/sim/world/control.test.ts`.

### `src/sim/flight/step.ts` `StepOptions.combat` and `src/app/session/step-options.ts`

**Analog:** `shipMasses` route. In `step-options.ts` (must stay Node-importable: no DOM, no `import.meta.glob`):
```typescript
readonly shipMasses?: readonly ShipMass[];           // StepOptionsInput
...(shipMasses === undefined ? {} : { shipMasses }), // omit optional keys (exactOptionalPropertyTypes)
```
Copy for `combat: { hulls?, mounts }`. The sim sees hulls only as options; a missing hull key means "not loaded", so no hit (D-01).

### `src/content/ships-hulls.ts` + `src/content/schemas/ship-hull.ts` (lazy artifact)

**Analog:** `src/content/ships-npc.ts` (whole file) and `src/content/schemas/ship-npc.ts`.
```typescript
const lazyNpcShips = import.meta.glob("./generated/ships-npc.json", { query: "?raw", import: "default" });
let cachedCatalogue: Promise<NpcShipCatalogue> | undefined;
export function loadNpcCatalogue(): Promise<NpcShipCatalogue> {
  cachedCatalogue ??= (async () => {
    const load = lazyNpcShips[NPC_SHIPS_PATH];
    if (load === undefined) throw new Error(`Wegolite: expected ... at ${NPC_SHIPS_PATH}, but they are missing.`);
    const parsed = NpcShipCatalogueSchema.safeParse(JSON.parse(await load()) as unknown);
    if (!parsed.success) { /* issue.path.join(".") : issue.message */ throw new Error(...); }
    return parsed.data;
  })();
  return cachedCatalogue;
}
```
Module name must start with `ships` so the sim's ESLint `**/content/ships*` denial covers it; a bare `hulls.ts` would NOT be covered, so the plans name it `ships-hulls.ts` (plan 13-04) and the lint rule is unchanged. Schema: `z.strictObject`, depth cap 7, node-count cap (Security V12). Importer: `start-session.ts` boot `Promise.all` (alongside `loadNpcCatalogue`).

### `tools/oolite-ingest/convert/ship-hulls.ts` and `generate.ts`

**Analogs:** `convert/npc-ships.ts` (`NPC_SHIPS_PATH`, `NPC_SHIP_KEYS`, `emitNpcShips(catalogue, masses, radii)`; generate.ts 37, 189), `convert/ship-radius.ts` (`hullRadius(key, modelFile, mesh)` 44-71, `computeShipRadii` 123; Cobra key must be added), `convert/octree.ts` (`buildOctree(mesh, file)` 449, `OctreeNode = 0 | -1 | readonly OctreeNode[]` 78, `Octree {radius, depth, root}` 80). Errors via `contentError("SCHEMA", file, key, { excerpt })`; float32 via `Math.fround`. Add a golden `tests/golden/content/ships-hulls.json` and drift gate through `assets:check`.

### `src/sim/combat/*` (new module family)

No same-role analog exists in `src/sim` for combat; use shape analogs:
- `constants.ts`: typed constants with Oolite file:line comments, pinned by a test against `equipment.json` `conditions.weapon_info` (ledger rows W1-W8, S1-S10, C1-C5 in RESEARCH).
- `state.ts`: `PlayerCombatState` beside `FlightState`, create/reset/sanitize/serialize modelled on `src/sim/flight/state.ts` (`serializeFlight` 147-179) and `src/sim/flight/sanitize.ts`; append to `hashWorld` text only when non-pristine (the `isNeverSpawned` device) so flight hash pins do not move (Pitfall 6/Pattern 3).
- `octree.ts`/`hit.ts`: port `Octree.m:336-471` and `OOVoxel.m:29-260` line by line in float64, local frame with z negated (Pattern 4); `ShipMass`-style option types as in `src/sim/world/ship-field.ts` 57-61.
- `step.ts`: ordering as in RESEARCH diagram; ascending shooter id; queued damage, no handlers.
- Determinism: no `Math.random`, `Date`, `for..in`, bare `.sort()`; use integer ticks (pulse 61, beam 13).

### `src/sim/world/entity.ts` etc. (NPC energy)

**Analog:** how `nav`/`rng` fields are spawned, sanitized (`sanitize.ts`), serialized (`serialize.ts`), snapshot-parsed with strict keys (`snapshot.ts`, `limits.ts`). Do once: bump `WORLD_SNAPSHOT_VERSION`, regenerate `tests/golden/world/inert-lave-epoch1.json` via `tests/helpers/write-inert-world-golden.ts`; never regenerate `flight-hash-pins.json`.

### `src/sim/player/outfitting.ts` (laser purchase)

**Analog:** `checkFit` (261), `applyFit` (391), `VISIBLE_EQUIPMENT_KEYS` (55), `FitRefusal`/`FitCheck` (116-129). Add separate `LASER_FIT_KEYS` x `FACINGS` allow-list with `checkLaserFit`/`applyLaserFit`; every other record stays `notOffered`; composite row key like `EQ_WEAPON_PULSE_LASER@fore`. Amend the PROJECT.md Key Decisions row and `tests/sim/player/outfitting.test.ts:118,724`.

### `src/persistence/save.ts` (v4)

**Analog:** v2-to-v3 chain.
```typescript
export const SAVE_VERSION = 3 as const;            // -> 4
export const SaveV3Schema = z.strictObject({
  ...SaveV2Schema.shape,
  version: z.literal(SAVE_VERSION),                // freeze v3 as z.literal(3)
  epoch: ..., nextEntityId: ...,
});
export function migrateV2ToV3(v2: SaveV2): SaveV3 {   // pure, total, no mutation
  return { ...v2, version: SAVE_VERSION, epoch: 0, nextEntityId: FRESH_WORLD_NEXT_ENTITY_ID };
}
```
Also extend `parseSave` (463; chain at ~511-517), `validateSaveSemantics` (560), `isEncodedSaveValid` (~699 uses `SaveV3Schema.safeParse`), `encodeSave` (~755). Template tests: `tests/persistence/save-v3.test.ts`, goldens `tests/golden/save/v4-from-v1-phase4.json`, `v4-from-v1-phase5.json`, `v4-from-v2-phase10-inflight.json` (plan 13-06). Reject laser keys inside `equipment`.

### `src/app/hud-model.ts` + `src/render/hud/draw.ts` (gauges)

**Analog:** `buildBars` (hud-model.ts 130-150) returns `HudBars`; `buildHudModel` (155-187) already has eight positional args, so add ONE optional trailing options object (Pitfall 10). draw.ts placeholders to feed from `model.bars`:
```typescript
drawFillGauge(context, LEFT_BAR_X, 816, 1, HUD_COLOR, HUD_COLOR);   // FWD -> model.bars.shieldFwd
drawFillGauge(context, LEFT_BAR_X, 844, 1, HUD_COLOR, HUD_COLOR);   // AFT -> shieldAft
drawFillGauge(context, LEFT_BAR_X, 894, 0.22, HUD_COLOR);           // CT  -> cabinTemp
drawFillGauge(context, LEFT_BAR_X, 914, 0, HUD_COLOR);              // LT  -> laserTemp
// right side E1..E4: drawFillGauge(context, RIGHT_BAR_X, bankY, 1, HUD_SCANNER_NEUTRAL_COLOR) line 602; fill bottom bank first (S10)
```
Fuel is the live-bar precedent: `model.bars.fuel` (line 520). Do not touch `HUD_ELEMENTS` or `HUD_LAYOUT`; add `identFrame` as a recorded non-element drawing, as `hyperspaceTarget` (string field, line 185) was. Update `tests/ui/hud-model.test.ts`, `tests/e2e/probe-shape.spec.ts`.

### `src/app/dock-feedback.ts` (message throttle)

**Analog:** lines 43-50.
```typescript
export function shouldEmitScrapeMessage(last: number | null, flightTime: number): boolean {
  if (!Number.isFinite(flightTime)) return false;
  if (last === null || !Number.isFinite(last)) return true;
  return flightTime - last >= SCRAPE_MESSAGE_INTERVAL_SECONDS;
}
```
Use event-router usage at lines 320-329 (`ctx.core.lastScrapeMessageTime`) for the per-kind gate (overheat, no energy, ident); events are payload-free and route via the table at event-router.ts 94-102.

### `src/render/launch-camera.ts`

**Analog:** `COCKPIT_OFFSET = vec(0, 7.25, -31)` (line 41); other views (x, y, -z) from `ships-client.json` extras. Rotate about local Y (aft 180, port +90, starboard -90, RESEARCH A1); extend `tests/render/launch-camera.test.ts`.

## Shared Patterns

### Optional-key omission (`exactOptionalPropertyTypes`)
**Source:** `src/app/session/step-options.ts` lines 62-76. **Apply to:** every new optional option/field.

### Strict untrusted JSON
**Source:** `src/content/ships-npc.ts` 48-60 plus `z.strictObject`. **Apply to:** hull artifact, save v4, snapshot parser.

### Add-an-action five-table edit
**Source:** `src/input/actions.ts`. **Apply to:** all INPUT-01 and view/fire keys; README controls table (`README.md:52,112,178`, pinned by `tests/contract/readme.test.ts`).

### Ignore-never-throw AI writes
**Source:** `src/sim/world/control-impl.ts` actor guard. **Apply to:** `fire`, all damage routing (`routeDamage` rejects non-finite amounts).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/sim/combat/octree.ts` (runtime ray test) | utility | transform | Octrees exist only at build time; port from Oolite `Octree.m`/`OOVoxel.m`, reuse `OctreeNode` encoding |
| `src/sim/combat/step.ts` (combat bookkeeping) | service | event-driven | No combat in the sim yet; follow `src/sim/dock/step.ts` structure and RESEARCH diagram |
| laser shot rendering layer | component | streaming | No transient-shot layer exists; planner chooses (RESEARCH A4) |
| `tests/e2e/combat.spec.ts` | test | request-response | Use `?test=1&traffic=1&clock=manual` as in `tests/e2e/traffic.spec.ts` |

## Metadata

**Analog search scope:** `src/sim`, `src/content`, `src/input`, `src/settings`, `src/persistence`, `src/app`, `src/render/hud`, `tools/oolite-ingest/convert`
**Files read:** about 16; others located by `git ls-files`/`rg`
**Pattern extraction date:** 2026-11-14
