# Phase 21: Roster, State Shape and Seams - Pattern Map

**Mapped:** 2026-11-25
**Files analyzed:** 36 (new and modified, grouped by plan)
**Analogs found:** 36 / 36 (every one is an in-repo precedent; all analog paths are git-tracked source)

Line numbers are at HEAD `65b4ee75`. Phase 21 is a "widen an existing, proven mechanism" phase: almost every file has an exact analog in the same module. The excerpts below are the ones the planner should point at. RESEARCH.md sections 4, 5, 6, 7 and 9 hold the design; this file only supplies the code to copy.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/sim/world/populate.ts` (add `INERT_RECORD_KEYS`, filter in `planInertPopulation`) | utility/planner | transform | same file `planInertPopulation` (`:225-259`) | exact (modify) |
| `tests/golden/world/inert-lave-epochs-1-20.json` + test (epoch 1-20 pin) | test/golden | batch | `tests/golden/world/inert-lave-epoch1.json` + `tests/helpers/write-inert-world-golden.ts` + `tests/sim/world/populate.test.ts` | exact |
| `tests/helpers/{inert-world,traffic-fixture,npc-flight,...}.ts` (nine-key whitelist) | test helper | transform | same files | exact (modify) |
| `scripts/vendor-oolite.sh`, `ASSETS.md`, `NOTICE`, `third_party/oolite/**`, `CHECKSUMS.sha256` | config/vendoring | file-I/O | existing vendoring rows for the 9 current models | exact |
| `tools/oolite-ingest/convert/npc-ships.ts` (28+shuttle keys, drop `aft_weapon_type` refusal, new fields) | converter | transform | same file (`STEERING_ASSUMED_ABSENT_KEYS` `:240-247`, `floatExtra`) | exact (modify) |
| `tools/oolite-ingest/convert/glb.ts`, `ships.ts`, `ship-hulls.ts`, `generate.ts` | converter | file-I/O | same files | exact (modify) |
| `src/content/schemas/ship-npc.ts` (strict schema widening, model regex) | schema | transform | same file (`z.strictObject`, `:69`) | exact (modify) |
| `src/content/schemas/ship-hull.ts` (`MAX_HULLS`, `MAX_HULL_ARTIFACT_BYTES`) | schema | transform | same file `:39`, `:47` | exact (modify) |
| `src/content/npc-glb-path.ts` (pattern, lower-case key rule) | utility | transform | same file `:9` | exact (modify) |
| new compiled tables: `auto-ai-map`, `role-categories`, `comms` (converter + schema + golden) | converter + schema | transform | `npc-ships.ts` + `schemas/ship-npc.ts` + `tests/golden/content/ships-npc.json` | role-match |
| `src/sim/world/limits.ts` (new bounds) | config | - | same file (`MAX_WEAPON_TEMPERATURE :133`, `MAX_ENTITY_CARGO :140`, `MAX_AI_PARAMS_KEYS :33`) | exact |
| `src/sim/world/entity.ts` (`Entity`, `SpawnInit`, `WeaponComponent`) | model | - | same file `WeaponComponent` `:34-55` | exact |
| `src/sim/world/serialize.ts` (new `;bty:` ... segments, `groups:`, `repop:`, `station:` lines) | serializer | transform | same file `serializeEntity :135-175`, `hashWorld :268-292` | exact |
| `src/sim/world/snapshot.ts` (v4 to v5) | serializer | transform | same file (`WORLD_SNAPSHOT_VERSION :99`, optional `buoys`) | exact |
| `src/sim/world/sanitize.ts` (`cleanV5Fields`) | utility | transform | same file `cleanV4Fields :582` | exact |
| `src/sim/world/world.ts` (`isMalformedInit`, `domainRefusal`, `spawnEntity`) | service | CRUD | same file `:406-505` | exact |
| `src/sim/combat/state.ts` (`PlayerStanding`, `isPristineCombat`, serialize/sanitize combat) | model | - | same file (`isPristineCombat :82`) | exact |
| `src/sim/rng.ts` (`"pod"` purpose, reserve `scoop/repop/inj`) | utility | - | same file `:70-91` | exact |
| `src/sim/ai/types.ts`, `ai/registry.ts`, new `ai/priority.ts` inert stub | model/registry | event-driven | `flight-script` entry in `AI_KEYS`/`AI_REGISTRY` | exact |
| `src/sim/world/retire.ts` (`retireShip`) | service | event-driven | `src/sim/world/kill.ts` `killShip :140-175` + `notifyKill :115` | exact |
| `src/sim/combat/ledger.ts` hit-reaction stage | service | transform | same file `applyLedger` | exact (extend) |
| `src/sim/combat/step.ts` (`drainFireQueue :291`, `coolShips :409`), `aim.ts`, `npc/stats.ts` (per-facing weapons, fire queue facing) | service | request-response | same files; player `laserFrame(orientation, facing)` in `aim.ts:63` | exact |
| `src/sim/world/debris.ts` (D-01 total velocity, `"pod"` fork, commodity/amount) | service | transform | same file `releaseDebris :898-1035`, `scatter :546` | exact |
| `src/sim/events.ts`, `combat/death.ts` (velocity on `shipDestroyed`/`playerDestroyed`) | model/event | event-driven | `shipDestroyed` at `events.ts:156-163` | exact |
| `src/render/bodies/explosions.ts` (burst offset by `velocity x t`) | component | event-driven | same file | exact (modify) |
| `src/app/npc-models.ts` (`prefetch(keys)`), `src/app/session/render-driver.ts:454` | service | streaming/file-I/O | same file `request()`/`open()` | exact |
| `src/app/probe.ts` (`spawnTestAnarchy` hook), `tests/fixtures/probe-shape.json` | hook | request-response | `spawnTestFlyers` `probe.ts:365-387` | exact |
| `tests/e2e/anarchy.spec.ts` (new spike spec) | test | request-response | `tests/e2e/traffic.spec.ts` | exact |
| `tests/e2e/{budget,traffic,npc-flight,combat}.spec.ts` (budget/ceiling constants, counts 9 to 29) | test | - | same files; shared constant in `tests/e2e/helpers/` | exact |
| `tests/app/session/tick-parity.test.ts`, `tests/e2e/combat.spec.ts` (twin re-pin) | test | - | same files (`HASH_60_AFTER_KILL :840`, `TWIN_HASH_60_AFTER_KILL :101`) | exact |
| new guards: aft tripwire, missiles tripwire, `priority` not spawnable, no non-kill removal via `killShip`, 32-key pin | test/guard | - | `tests/guards/ship-hit-consumers.test.ts`, `tests/guards/on-event-handlers.test.ts` | exact |
| new strip-and-rehash tests (v5 vs v4) | test | transform | `tests/sim/world/hash.test.ts`, `snapshot-codec.test.ts` | role-match |
| `FIDELITY.md` (E-173, E-179 update; pod, debris rows), `CHANGELOG.md`, `docs/PERFORMANCE.md`, `.planning/PROJECT.md` Key Decisions | docs | - | existing rows in each | exact |

## Pattern Assignments

### `src/sim/world/populate.ts` (isolation, plan 21-01)

**Analog:** itself, `planInertPopulation` (`:225-259`). The isolation filter goes before the scan-class filter and before any draw.

**Current code to modify** (`:225-239`):
```typescript
export function planInertPopulation(
  rng: RngState,
  layout: SystemLayout,
  records: readonly InertShipRecord[],
): { readonly ships: readonly PlannedShip[]; readonly fallbacks: number } {
  const eligible = records.filter((record): record is EligibleRecord =>
    isScanClass(record.scanClass),
  );
  const ships: PlannedShip[] = [];
  let fallbacks = 0;
  for (const entry of INERT_POPULATION) {
    if (!(totalWeight(eligible, entry.role) > 0)) continue;
    for (let i = 0; i < entry.count; i++) {
      const place = locationByCode(rng, entry.location, layout);
      if (place.fallback) fallbacks += 1;
      const record = pickRecord(rng, eligible, entry.role);
```
**Pattern to add:** export a frozen `INERT_RECORD_KEYS` (adder, cobramk1, gecko, krait, mamba, moray, shuttle, sidewinder, viper) and reduce `records` to those keys in that order first (RESEARCH Code Examples, section 5). Pin test: filtered list equals the nine.

**Golden-pin analog:** `tests/golden/world/inert-lave-epoch1.json` has `{name, worldSeed, count, fnv, section}`; produced by `tests/helpers/write-inert-world-golden.ts`, consumed by `tests/sim/world/populate.test.ts`. The epoch 1-20 golden must carry both fnv columns (section fnv and `hashWorld` fnv). Baseline values are in RESEARCH section 5; the executor re-measures on its own base commit and commits the golden before the isolation change. This pin never re-pins (D-04 reserves it for the owner).

---

### `tools/oolite-ingest/convert/npc-ships.ts` (converter, plans 21-03/21-04)

**Analog:** itself. Drop only the `"aft_weapon_type"` entry; keep the other five as tripwires.

**Refusal list** (`:240-247`):
```typescript
export const STEERING_ASSUMED_ABSENT_KEYS: readonly string[] = [
  "accuracy",
  "reaction_time",
  "scanner_range",
  "aft_weapon_type",
  "port_weapon_type",
  "starboard_weapon_type",
];
```
**Error pattern** (`:249-251`):
```typescript
function fail(key: string, detail: string): never {
  throw contentError("SCHEMA", NPC_SHIPS_PATH, key, { excerpt: detail });
}
```
**Extra-key reader pattern** (`floatExtra`, `:253+`): a present non-finite value fails the build rather than taking the default. Copy this for `bounty`, `fuel`, `has_scoop`, `has_fuel_injection`, `auto_ai`, `escorts`, `escort_roles` readers (fuzzy booleans stored as float32 probabilities, as `fragmentChance` is).

Also modify (same-file coupled places listed in RESEARCH 2.2): `NPC_SHIP_KEYS` (`:62-72`), `owners.length !== 1` GLB-ownership rule (`:480-496`), `convert/glb.ts:151` `SHIP_MODEL_PATTERN` (allow `-`), `convert/ships.ts:55` `VENDORED_MODEL_FILES`.

### `src/content/schemas/ship-npc.ts`

**Analog:** itself, strict object with the model regex at `:69`:
```typescript
model: z.string().regex(/^oolite_[a-z0-9_]+\.dat$/),
```
Widen to allow `-` (`oolite_boa-mk2.dat`). Every new field goes behind `z.strictObject` with a default so nine legacy records compile unchanged. Related: `src/content/npc-glb-path.ts:9` `NPC_GLB_PATH_PATTERN = /^models\/[a-z0-9][a-z0-9_-]*\.glb$/` is lower-case only; `morayMED` needs a lower-casing naming rule or a widened pattern.

### New compiled tables (`autoAImap`, `role-categories`, comms subset)

**Analog:** the `npc-ships.ts` converter + strict schema + golden + `assets:check` drift gate chain (`tests/golden/content/ships-npc.json`, `tests/content/ships-npc.test.ts`). Source plists: `third_party/oolite/Config/autoAImap.plist` and `role-categories.plist` (byte-identical to the checkout) and the vendored `descriptions.plist` (the checkout copy is ahead of the pin; read the vendored copy). Role-category entries contain `+` and upper case: loosen the string pattern.

---

### `src/sim/world/serialize.ts` (v5 hash segments, plan 21-05)

**Analog:** itself. Optional segments append after `cargo:` in a fixed order; a pristine value prints nothing.

**Entity pattern** (`:135-175`, the load-bearing tail):
```typescript
  // The optional v4 segments (FOUND-18, D-09): each prints whenever any of its
  // components is non-zero, so pristine-omit never hides a real difference, and
  // is absent for a pristine value, so a pristine entity hashes as before.
  if (velocity.x !== 0 || velocity.y !== 0 || velocity.z !== 0) {
    segments.push(`vel:${vecText(velocity)}`);
  }
  if (
    weapon.temperature !== 0 ||
    weapon.lastShotTick !== 0 ||
    weapon.missedShots !== 0
  ) {
    segments.push(
      `wpn:${canon(weapon.temperature)},${int(weapon.lastShotTick)},${int(weapon.missedShots)}`,
    );
  }
  if (entity.cargo !== 0) segments.push(`cargo:${int(entity.cargo)}`);
  return segments.join(";");
```
Add `bty:`, `role:`, `grp:`, `ck:`, `pod:`, `wpf:`, `wty:`, `inj:` here, each guarded by its pristine test (RESEARCH 4.2 table and Code Examples).

**World-level lines** (`hashWorld`, `:268-292`): `staticHealth:` and `buoys:` print only when non-pristine, and also for a never-spawned world; add `groups:`, `repop:`, `station:` after `buoys:` and before the combat line, using the same `if (!isPristineX(...)) text += "\n" + serializeX(...)` shape after a `sanitizeX(world)` repair call. Extend `isPristineCombat` (`combat/state.ts:82`), `serializeCombat` and `sanitizeCombat` for `standing`, and keep `standing` untouched by `dockReset`/`launchReset`.

### `src/sim/world/snapshot.ts` / `sanitize.ts` / `world.ts`

**Analogs:** `WORLD_SNAPSHOT_VERSION = 4` at `snapshot.ts:99` (to 5); entity fields always written by `snapshotEntity`, optional world keys (`buoys`, `snapshot.ts:228`) omitted when pristine. Strict parser (`asObject` allow-list) refuses unknown keys, so every new key is added to the allow-list. Tests to update: `tests/sim/world/snapshot-codec.test.ts:276` (`["version 5", set("version", 5), "version"]` becomes version 6 refusal) and `:999-1001` (`toBe(4)` to 5).

**Sanitize template** (`cleanV4Fields`, `sanitize.ts:582-625`): per-field repair so one bad leaf never resets neighbours:
```typescript
function cleanV4Fields(entity: Entity): boolean {
  let repaired = false;
  const mark = (flag: boolean): void => {
    if (flag) repaired = true;
  };
  ...
  const weapon: unknown = entity.weapon;
  if (!isObject(weapon)) {
    entity.weapon = { temperature: 0, lastShotTick: 0, missedShots: 0 };
    repaired = true;
  } else {
    const w = entity.weapon;
    const temperature = cleanRange(w.temperature, MAX_WEAPON_TEMPERATURE, 0);
    w.temperature = temperature.value;
    mark(temperature.repaired);
    ...
```
Write `cleanV5Fields` the same way and call it from the `mark(cleanV4Fields(entity))` site (`sanitize.ts:741`). All bounds live in `limits.ts` only.

**Spawn init:** `spawnEntity` (`world.ts:406-505`) needs an `isMalformedInit` and a `domainRefusal` branch per new optional `SpawnInit` field (copy the `cargo` branch).

### `src/sim/world/entity.ts` (`WeaponComponent` per-facing)

**Analog:** the existing record, whose doc comment says lifting the aft refusal "needs per-facing temperatures and is a snapshot-format change" (`:34-55`):
```typescript
export interface WeaponComponent {
  temperature: number;
  lastShotTick: number;
  missedShots: number;
}
```
Add `aftTemperature`, `portTemperature`, `starboardTemperature` (0..`MAX_WEAPON_TEMPERATURE`); `lastShotTick` and `missedShots` stay single (Oolite's `shot_time` is one timer). Update the comment (the refusal is no longer the reason it is forward-only).

### `src/sim/rng.ts` (stateless purposes)

**Analog:** itself (`:70-91`):
```typescript
export type RngPurpose = "world" | "ai" | "combat" | "cargo" | "damage";
...
export const RNG_PURPOSE_CODES: Readonly<Record<RngPurpose, number>> =
  Object.freeze({ world: 1, ai: 2, combat: 3, cargo: 4, damage: 5 });
```
Add `pod: 6`, optionally reserve `scoop: 7`, `repop: 8`, `inj: 9`. Codes are one-way, never renumber. Stateless purposes are not in `ENTITY_RNG_PURPOSES`. Fork with `createRngState(forkSeed(world.worldSeed, victim.id, "pod"))` (`forkSeed` at `rng.ts:134`).

---

### `src/sim/world/retire.ts` (`retireShip`, plan 21-06)

**Analog:** `src/sim/world/kill.ts` `killShip` (`:140-175`) and `notifyKill` (`:115-124`). Copy the "capture, `world.store.kill`, idempotent boolean" shape, drop the event, the killer pair and the debris release. Keep the imports minimal (`postAiEvent` from `./world.js`, `NO_ENTITY`/`PLAYER_ID` not needed). Do not use the word `killer` in the new file (guard `tests/guards/kill-credit-consumers.test.ts`).

**Pattern to copy** (`kill.ts:115-124`, `:146-151`):
```typescript
function notifyKill(world: World, victim: EntityId, killer: EntityId): void {
  for (const holder of world.store.live) {
    if (holder.dead || holder.kind !== "ship" || holder.id === victim) continue;
    if (holder.nav.targetId !== victim) continue;
    postAiEvent(world, { to: holder.id, name: "shipTargetLost" });
  }
  ...
}
...
  const entity = world.store.get(id);
  if (entity === undefined) return false;
  const kind = entity.kind;
  if (!world.store.kill(id)) return false;
```
Test analog: `tests/sim/world/kill.test.ts` (no `shipDestroyed`, no debris, targeters notified, second call false, `nextId` unchanged).

### `src/sim/combat/ledger.ts` hit-reaction stage

**Analog:** `applyLedger` itself (module header `:20-21`: every record applies before lethality, so a doomed ship still receives `shipHit`). Add a stage that reads the applied record, not the `shipHit` event, returns `{ victim, aggressor, kind, lethal, energyRemaining }` in ledger order, excludes scrape records, and posts no AI event in this phase. Do not name `shipHit` in any new file (`tests/guards/ship-hit-consumers.test.ts` allow-list is `src/sim/events.ts` and `src/sim/combat/ledger.ts`; the guard shape is `shipHitViolations(files)` over comment-stripped `src/**` via `./source-scan.js` `listSrcFiles`/`withoutComments`).

### `src/sim/combat/step.ts` / `aim.ts` / `npc/stats.ts` (per-facing fire)

**Analog:** the player path, `laserFrame(orientation, facing)` (`aim.ts:63`) already supports aft/port/starboard; `drainFireQueue` (`combat/step.ts:291`) is the forward-only NPC site (reads `shooter.weapon.temperature`, `npcLaserRay` hardcodes `laserFrame(entity.orientation, "fore")`). Turn `world.fireQueue` from `EntityId[]` to `{id, facing}` (never hashed, free to change), make `NpcWeapon` a per-facing record, extend `coolShips` (`:409`) to all four temperatures, extend `NpcFlightStats` (`npc/stats.ts:32-60`) with the aft type. Forward-only byte-identical: a pristine aft temperature prints nothing. Add the tripwire guard (a compiled record with non-none aft/port/starboard must not reach `behaviourAttackTarget` before Phase 23) in the style of the `ship-hit-consumers` guard.

---

### `src/sim/world/debris.ts` (D-01, pod identity; plan 21-07)

**Analog:** itself, `releaseDebris` (`:898-1035`) and `scatter` (`:546-571`).

**Current drift line to change** (`:902`, `:918`, `:929`):
```typescript
  const stream = createRngState(victim.rng.combat);
  ...
  const drift = vecOrZero(victim.velocity);
  ...
      spawnCargoPiece(
        world,
        pod,
        scatter(stream, box, origin, drift),
        ctx.tick,
      );
```
D-01: replace `drift` with total velocity = `victim.velocity + rotate(orientation, (0,0,-1)) * speed`; `behaviours/attack.ts` already has `velocityOf(orientation, speed)`. Apply to pods, plates (`:1020`) and wrecks (`:993-995`, `drift.x + normal.x * pushSpeed`), keep `clampDebrisVelocity`. The module comment at `:51` ("never its flight `speed` (D-01)", Phase 16's D-01) must be rewritten. Pod identity: derive a separate `"pod"` stream (do not draw from `stream`, so `POD_DRAWS_PER_SURVIVOR = 13` (`:252`) and every later draw stay in place). Guard test: "debris velocity equals ship velocity plus kick"; also a test that for speed 0 the pod position/orientation/kick equal pre-change values.

Test analogs: `tests/sim/world/debris.test.ts`, `debris-cadence.test.ts`, `debris-cap.test.ts`; twin pins `tests/app/session/tick-parity.test.ts:840` / `:1165`, `tests/e2e/combat.spec.ts:101` / `:116`, `tests/app/session/death-twin.test.ts`. Re-pin only with a measured cause, Node equals browser, and a comment naming the plan in each file (D-04).

### `src/sim/events.ts` / `combat/death.ts` / `src/render/bodies/explosions.ts` (D-02)

**Analog:** `shipDestroyed` event (`events.ts:156-163`) and `killShip` emission (`kill.ts:156-170`):
```typescript
  events.push({
    kind: "shipDestroyed",
    id,
    position: { x: entity.position.x, y: entity.position.y, z: entity.position.z },
    radius: entity.radius,
    specKey: entity.specKey,
    killer: normalised,
  });
```
Add a `velocity` copy the same way (value copy, never an alias). Render side offsets each burst centre by `velocity * t` (1x small, 0.85x big). Explosion layer is outside the world hash, so no re-pin. Keep ids out of app/render code (`entity-id-scope` guard).

---

### `src/sim/ai/types.ts`, `ai/registry.ts`, `ai/priority.ts` (stub)

**Analog:** the `flight-script` entry. `AI_KEYS = ["test-pilot", "flight-script"] as const` (`ai/types.ts:19`); `AI_REGISTRY` is `Record<AiKey, AiModule>`, so adding `"priority"` forces a registry entry. Define the stub with no `onEvent` (`MAX_ON_EVENT_HANDLERS = 1` at `tests/guards/on-event-handlers.test.ts:29`). Add event names additively to `AI_EVENT_NAMES` (`:55-79`), never rename `shipAttacked`. 32-key pin test lives under `tests/` because the AI lint zone forbids importing `world/limits` (`MAX_AI_PARAMS_KEYS = 32`, `limits.ts:33`; pack related values into arrays, RESEARCH 4.4).

---

### `src/app/npc-models.ts` (prefetch, D-07; plan 21-08)

**Analog:** itself. The loader is a latch closed until the first in-flight frame; `request()` is a no-op until `open()`:
```typescript
    open() {
      opened = true;
    },
    request(keys): void {
      if (!opened || disposed) return;
      for (const key of keys) {
        if (states.has(key)) continue;
        const glb = glbFor(key);
        if (glb === undefined) continue;
        fetchKey(key, glb);
      }
    },
```
Add a separate `prefetch(keys)` (bounded concurrency, uses `fetchKey` + `states`, not gated by `opened`), called once from the session when traffic is on and mode is menu/docked. `render-driver.ts:454` (`if (currentState.mode === "inFlight") npcModels.open();`) stays. Update the interface at `npc-models.ts:39-42`. Tests: traffic-off must still request nothing (`budget.spec.ts`); the "no NPC request before first in-flight frame" assertion in `traffic.spec.ts` becomes "before the prefetch trigger" and the ceiling is measured excluding the NPC asset set.

### `src/app/probe.ts` (`spawnTestAnarchy`) and `tests/e2e/anarchy.spec.ts`

**Analog:** hooks `spawnTestShooter`, `spawnTestFlyers`, `spawnTestAttacker` (`probe.ts:365-387`, shape pinned by `tests/fixtures/probe-shape.json`) and spec `tests/e2e/traffic.spec.ts` (URL `/?test=1&traffic=1&clock=manual`, `runTickScript` Node twin). Gate the new hook on `?test=1&traffic=1`. `DRAW_CALL_BUDGET = 50` is duplicated in `budget.spec.ts:56`, `traffic.spec.ts:48`, `npc-flight.spec.ts:51`, `combat.spec.ts:151`; `FIRST_LOAD_BYTES_CEILING = 9 * MIB` in `budget.spec.ts:73` and `traffic.spec.ts:55`. Move both to a shared `tests/e2e/helpers/` constant when changing.

## Shared Patterns

### Pristine-omit hashing and strip-and-rehash proof
**Source:** `src/sim/world/serialize.ts:135-175` and `:268-292`; precedent rows in `.planning/PROJECT.md` (lines ~303, 309).
**Apply to:** every new hashed field (plan 21-05) and the pod fields (21-07). A world using none of the new fields must hash byte-identically (goldens `flight-hash-pins.json`, `inert-lave-epoch1.json`, the new epoch 1-20 file unmoved); a world setting each field prints exactly that segment and stripping it reproduces the old text. Test analogs: `tests/sim/world/hash.test.ts`, `flight-hash-pins.test.ts` (header: never regenerate to make it pass).

### Totality: sanitize + strict parse
**Source:** `sanitize.ts:582-625` (`cleanV4Fields`), `snapshot.ts` strict allow-list parser.
**Apply to:** all new entity, world and combat state. Bounds only in `limits.ts`. Every repair counted, one bad leaf never resets neighbours.

### Stateless RNG purposes
**Source:** `src/sim/rng.ts:70-91, :134`.
**Apply to:** pod identity, and the reserved scoop/repop/injector rolls. Adding a draw must not move any other stream.

### Guard tests (tripwires without a consumer)
**Source:** `tests/guards/ship-hit-consumers.test.ts` (comment-stripped `src/**` scan via `tests/guards/source-scan.js`, allow-list, rule string naming the todo), `tests/guards/on-event-handlers.test.ts:29`, `tests/guards/kill-credit-consumers.test.ts`.
**Apply to:** aft/port/starboard tripwire, missiles tripwire, "nothing spawns `aiKey: priority`", "non-kill departures never call `killShip`", the 32-key pin. A legitimate consumer updates the allow-list in the same commit.

### Content: strict schema + golden + drift gate
**Source:** `tools/oolite-ingest/convert/npc-ships.ts`, `src/content/schemas/ship-npc.ts`, `tests/golden/content/ships-npc.json`, `docker compose run --rm assets` / `assets:check`.
**Apply to:** the 29 records and all three compiled tables. Never hand-edit generated data. Hard-coded counts that must follow: `budget.spec.ts` (`toHaveLength(9)`, `toHaveLength(43)`), `npc-assets.spec.ts:126`, `tests/content/ships-npc.test.ts`, `ships-hulls.test.ts`, `convert/*.test.ts`; give about 35 helpers/tests an explicit nine-key whitelist instead of "any record of role X".

### Vendoring and provenance
**Source:** `scripts/vendor-oolite.sh --export-pin /home/opencode/git/oolite <out-dir>` then `docker compose run --rm -v <out>:/oolite-pin:ro -e OOLITE_LOCAL=/oolite-pin/Resources -e OOLITE_PINNED_SHA256=/oolite-pin/pinned.sha256 assets sh scripts/vendor-oolite.sh`.
**Apply to:** the 9 `.dat` and 51 textures. Add `ASSETS.md` rows first (the script refuses unlisted paths); `tests/compliance-assets.test.ts` cross-checks filesystem, `ASSETS.md`, `CHECKSUMS.sha256`. Read `descriptions.plist` from the vendored copy (checkout is ahead of the pin).

### Re-pin discipline (D-04)
**Source:** CONTEXT D-04; `tests/app/session/tick-parity.test.ts`, `tests/e2e/combat.spec.ts`.
**Apply to:** plan 21-07 only (pod identity plus D-01). Record cause, Node equals browser, comment naming the plan, SUMMARY note "owner-sanctioned". Not re-pinnable without the owner: acceptance thresholds/detectors, the epoch 1-20 pin, any unexplained move.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `tests/e2e/anarchy.spec.ts` p95 frame-time sampling | test | measurement | No spec samples p95 frame time; use the sampler described in `docs/PERFORMANCE.md` on the remote GPU (one-off, D-06). Draw-call counting itself copies `traffic.spec.ts`. |
| Commodity-per-capsule draw (cargo kind weights, plentiful/scarce, amount by unit) | service | transform | No existing code ports `getContainersOfGoods` / `getRandomAmountOfCommodity`; follow the draw-order discipline of `debris.ts` and goods data of `src/sim/economy/market.ts` (`MarketGood`, `generateMarket`) and `commodities.json`. Use RESEARCH section 6 for the Oolite rules. |
| Prefetch with bounded concurrency | service | streaming | `npc-models.ts` has per-key fetch but no concurrency limiter; RESEARCH 8.4 designs it. |

## Metadata

**Analog search scope:** `src/sim/world`, `src/sim/combat`, `src/sim/ai`, `src/sim/rng.ts`, `src/app`, `tools/oolite-ingest/convert`, `src/content`, `tests/guards`, `tests/golden`, `tests/sim/world`, `tests/e2e`.
**Files scanned:** about 30 read or excerpted (targeted ranges); RESEARCH.md carries the rest of the verified line references.
**Tracked-source gate:** `git ls-files` confirmed for `npc-ships.ts`, `inert-lave-epoch1.json`, `ship-hit-consumers.test.ts`; all other named analogs are under `src/`, `tools/`, `tests/` (tracked source, no `.gsd` capability mirrors involved).
**Pattern extraction date:** 2026-11-25
