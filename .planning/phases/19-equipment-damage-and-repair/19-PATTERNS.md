# Phase 19: Equipment Damage and Repair - Pattern Map

**Mapped:** 2026-11-21
**Files analyzed:** 22 new/modified source areas (plus test files)
**Analogs found:** 21 / 22 (all tracked source, verified under `src/`, `tests/`, `tools/`)

Revised decisions applied: D-05 factor is 95 (`SHIP_TRADE_IN_FACTOR = 95`, cite `PlayerEntity.m:1739`); D-11 v1-v4 saves return `corrupt` (not `unreadable`).
Line numbers below were read this session; re-check before quoting in a plan.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/sim/combat/internal-damage.ts` (new) | service (pure sim) | transform / event-emitting | `src/sim/combat/ledger.ts` + `src/sim/world/debris.ts` (rng convention) | role-match |
| `src/sim/combat/ledger.ts` (edit, player branch ~160-179) | service | event-driven | itself | exact |
| `src/sim/combat/step.ts` (edit `CombatOptions.internalDamage`, event-order doc ~739) | service | request-response | `mounts`/`hulls`/`debris` fields in `CombatOptions` (~118-146) | exact |
| `src/sim/events.ts` (edit: 2 kinds) | model | event | `laserRefused` (non-reserved kind) | exact |
| `src/sim/rng.ts` (edit: `damage: 5`) | utility | transform | `cargo: 4` purpose | exact |
| `src/sim/economy/cargo.ts` (edit: `holdPods`) | utility | transform | `podsFor`, `holdPodsUsed`, `capacityPodsFor` in same file | exact |
| `src/sim/player/profile.ts` (edit: `damagedEquipment`) | model | CRUD | `equipment` field, `purchase` | exact |
| `src/sim/player/damage.ts` (new: `applyEquipmentDamaged`, `applyCargoDestroyed`) | service | CRUD (immutable replace) | `applyFit`/`purchase` in `outfitting.ts`/`profile.ts` | role-match |
| `src/sim/player/outfitting.ts` (edit: repair door) | service | request-response (money path) | laser door `LASER_FIT_KEYS`/`parseLaserFitKey`/`checkLaserFit` (~521-563) | exact |
| `src/persistence/save.ts`, `autosave.ts` (v5) | model/service | file-I/O | `SaveV4Schema` (`save.ts:351-355`), `parseSave` (~590) | exact |
| `src/content/schemas/equipment.ts`, `tools/oolite-ingest/convert/equipment.ts` | config/schema | batch transform | `purchase_sort_order` read in `project()` | exact |
| `src/app/session/event-router.ts` (edit: kinds, `damageFlow`, `hudMessages` arms) | controller (router) | event-driven | `createHyperspaceFlow` (572-592), `hyperspaceRefused` row (114) | exact |
| `src/app/session/step-options.ts` (edit: facts) | utility | transform | `equipmentSet()` identity cache, `station-controller.ts:205-214` | role-match |
| `src/app/session/station-controller.ts` (confirm verb, `commitProfile` reuse) | controller | request-response | itself, `commitProfile` 744-752 | exact |
| `src/ui/station-model.ts` (F3 repair row, F5 damaged list) | component (view model) | transform | `buildOutfittingModel` (~915-1051), `buildStatusModel` (~552-632) | exact |
| `FIDELITY.md` rows (E-154+) | doc | n/a | existing rows, `tests/contract/fidelity.test.ts` | exact |
| Tests: `internal-damage.test.ts`, `.property.test.ts`, cadence test | test | n/a | `tests/sim/combat/*.property.test.ts`, `tests/sim/flight-cadence.test.ts` | role-match |
| `tests/persistence/save-v5.test.ts` | test | file-I/O | `tests/persistence/save-v4.test.ts` (worst case 545-606; frozen classifier 620-660) | exact |
| `tests/app/session-order.test.ts` and router-using tests | test | event | existing pins (order, table, kind count) | exact |
| `tests/guards/hud-message-length.test.ts` | test | n/a | itself | exact |
| CBT-08 fight twin: `tick-parity.test.ts`, `tests/e2e/combat.spec.ts` | test | event | existing twins | exact |
| Autopilot-disengage, galactic-jump abort, ANA chart (D-06) | n/a | n/a | none: no in-use state exists in Wegolite | none |

## Pattern Assignments

### `src/sim/combat/ledger.ts` player branch (edit)

**Analog:** itself, lines 160-179 (read this session).

```typescript
if (record.target === PLAYER_ID) {
  if (combat === undefined) continue;
  const route = record.kind === "scrape" ? routeScrapeDamage : routeDamage;
  const result = route(combat, record.amount,
    sub(record.sourcePosition, player.position),
    rotate(player.orientation, LOCAL_FORWARD));
  events.push({ kind: "shipHit", target: PLAYER_ID, source: record.source,
    amount: record.amount, shield: result.shieldAbsorbed });
  continue;
}
```
Insert after the `shipHit` push: if `facts` present, and (`record.kind === "scrape"` or `combat.energy > 0`), call the roll with `result.applied`. `applyLedger` signature is positional `(world, worldStepped, player, combat, records, events)`; add facts as a trailing optional parameter, so every existing caller is unchanged. Skip the roll (no draw, no event) when `world`, facts or combat is absent.
Lazy stateless stream (RESEARCH Pattern 2): `createRngState(mix32(forkSeed(world.worldSeed, PLAYER_ID, "damage"), player.tick >>> 0))`.

### `src/sim/combat/internal-damage.ts` (new)

**Analog:** RESEARCH "port skeleton" plus `src/sim/world/debris.ts:10-11` rng convention (`ranrot_rand() % N` = `Math.floor(u * N)`, `randf()` = `u`).
Imports to copy: `rngNext`, `createRngState`, `mix32`, `forkSeed` from `../rng.js`; `PLAYER_MASS_KG` from the constants file (`constants.ts:171`); `SimEvent` type from `../events.js`. No Three.js, no profile type, no DOM.
Constants with Oolite file:line comments: `PLAYER_INTERNAL_DAMAGE_FACTOR = 31` (`PlayerEntity.h:331`), `SHIP_TRADE_IN_FACTOR = 95` (`PlayerEntity.m:1739`), `MAX_ROLLS = 256` clamp. Total on NaN, negative, empty, huge amounts. Work on copies of `items` and `pods`. Draw order: gate draw per loop pass; on pass one die draw; one `randf()` pick draw only on the equipment branch.

### `src/sim/events.ts`, `src/sim/rng.ts` (edit)

Analog `rng.ts:60-90`:
```typescript
export type RngPurpose = "world" | "ai" | "combat" | "cargo";
export const RNG_PURPOSE_CODES: Readonly<Record<RngPurpose, number>> =
  Object.freeze({ world: 1, ai: 2, combat: 3, cargo: 4 });
```
Add `"damage"` and `damage: 5`; do not add it to `ENTITY_RNG_PURPOSES` (stateless, like `cargo`). Pin a vector in `tests/sim/rng.test.ts`. Events: `{ kind: "equipmentDamaged"; key: string }` and `{ kind: "cargoDestroyed"; commodity: string; amount: number }`, no UI copy, not added to `RESERVED_EVENT_KINDS` (`events.ts:215-231`).

### `src/sim/economy/cargo.ts` (`holdPods`)

Analog: same file. Constants at lines 21-24 (`KILOGRAMS_PER_POD = 1000`, `MAX_KILOGRAMS_IN_SAFE = 499`, `GRAMS_PER_POD = 1_000_000`, `MAX_GRAMS_IN_SAFE = 499_999`), `podRule(unit)`, and `podsFor` using `floor((podSize - safe - 1 + quantity) / podSize)`. Add `holdPods(cargo, commodities)` returning `{commodity, amount}[]` in compiled commodity `sortOrder`, full pods then the dregs pod; assert `holdPods(...).length === holdPodsUsed(...)`. Keep it in `cargo.ts` (`tests/guards/economy-purity.test.ts:39-44` pins four economy files).

### `src/sim/player/outfitting.ts` repair door (edit)

**Analog:** laser door, lines 515-563 (read above): literal allow-list const, `isXKey` by membership (never `in`), composite key with `@` separator, strict `parseLaserFitKey` returning `null` for forged keys. Copy that shape:
```typescript
export const LASER_FIT_KEYS = Object.freeze([NO_LASER, ...LASER_KEYS] as const);
export function isLaserFitKey(value: unknown): value is LaserFitKey {
  return LASER_FIT_KEYS.some((key) => key === value);
}
export function parseLaserFitKey(value: string): ParsedLaserFitKey | null {
  const parts = value.split(LASER_FIT_SEPARATOR);
  if (parts.length !== 2) return null;
  ...
}
```
New: `REPAIRABLE_EQUIPMENT_KEYS` = 19-03's `DAMAGEABLE_EQUIPMENT_KEYS` (the same frozen array of EQ_DOCK_COMP, EQ_GAL_DRIVE, EQ_ADVANCED_COMPASS, EQ_ADVANCED_NAVIGATIONAL_ARRAY, no second literal; plan checker iteration 3, CONTEXT D-03), `parseRepairKey`, `checkRepair` (order: allow-list, `isValidPrice`, key in `damagedEquipment` (`notDamaged`), tech rule (raw TL one lower, `profile.ts:175-186`), credits), `applyRepair` (identity on refusal; moves key to the END of `equipment`; cost `Math.ceil(price / 2)`; no clock advance).
`checkFit` guard pattern (lines 331-333 area):
```typescript
if (!(VISIBLE_EQUIPMENT_KEYS as readonly string[]).includes(item.key)) {
  return { ok: false, reason: "notOffered" };
}
```
Add a damaged-key refusal after this; classify it in `LISTED_REFUSALS` (~157-170) as hidden and give copy in `fitReason` (`station-model.ts` ~826-853). Add a test that `REPAIRABLE_EQUIPMENT_KEYS` equals the damageable `SINGLE_INSTANCE_KEYS` from the real catalogue (in 19-05 this is the guard `tests/guards/damageable-equipment.test.ts`, which also proves no laser record is damageable).

### `src/app/session/event-router.ts` (edit)

**Analog:** `createHyperspaceFlow` (572-592) for a subscriber, and the HUD refusal pattern:
```typescript
messages.clearPrevious();
messages.enqueue(refusalCopy(event.reason, event.blocker), 4.5);
```
Table row analog (line 114): `hyperspaceRefused: ["hyperspaceFlow"],`. Add `equipmentDamaged: ["damageFlow","hudMessages"]`, `cargoDestroyed: ["damageFlow","hudMessages"]`; extend `ROUTED_EVENT_KINDS` (22 to 24) and `EVENT_SUBSCRIBER_ORDER` (currently `stationFlow, worldLifecycle, hudMessages, ...`, lines 41-47) with `damageFlow` before `hudMessages`. `damageFlow` calls a pure profile op then `commitProfile(next)` (`station-controller.ts:746-752`):
```typescript
function commitProfile(next: PlayerProfile): boolean {
  if (next === ctx.core.profile) return false;
  ctx.core.profile = next; onProfileChanged(ctx.core.profile); renderStation(); return true;
}
```
Strings: `"%@ damaged."` and `"%@ destroyed."` at 4.5 s; names from `ctx.core.equipmentCatalogue` and `ctx.core.commodities`. Follow `OUTFITTING_EMPTY_TEXT` (`station-model.ts:810-818`) for a literal plus a test reading `third_party/oolite/Config/descriptions.plist` (lines 895, 896, 1846, 1847, 494).
Touched pins: `tests/app/session-order.test.ts`, every `createEventRouter(ctx, {...})` call in tests, the `tick-parity.test.ts` harness stubs.

### `src/app/session/step-options.ts` (facts cache)

**Analog:** `equipmentSet()` (`station-controller.ts:205-214`):
```typescript
if (ctx.core.equipmentSetSource !== ctx.core.profile.equipment) {
  ctx.core.equipmentSetSource = ctx.core.profile.equipment;
  ctx.core.equipmentSetCache = new Set(ctx.core.profile.equipment);
}
return ctx.core.equipmentSetCache;
```
Cache `internalDamage` facts the same way, keyed by profile identity (runs at 120 Hz); omit when `equipmentCatalogue` is undefined.

### `src/persistence/save.ts` and `autosave.ts` (v5)

**Analog:** `save.ts:351-355` and `parseSave` end (590-597):
```typescript
export const SaveV4Schema = z.strictObject({
  ...SaveV3Schema.shape,
  version: z.literal(SAVE_VERSION),
  laserMounts: LaserMountsSchema,
});
...
} else {
  // A numeric version this build knows ... positively this family, so corrupt
  return { ok: false, reason: "corrupt" };
}
```
v5: add required `damagedEquipment` (array, max `MAX_SAVE_DAMAGED_EQUIPMENT` = 16) to a fresh v5 strictObject; `SAVE_VERSION = 5`; v1-v4 numeric versions fall to the existing `corrupt` branch (do not return `unreadable`; it blocks autosave, `save-controller.ts:97-109`). Remove `SaveV1..V4` schemas, `migrateV*` and their goldens (keep one literal v4 blob proving `corrupt`). Semantic rules in `validateSaveSemantics`: damageable allow-list, no duplicates, disjoint from `equipment`, no `_DAMAGED` key, combined length <= 64. Plumbing: `SaveInputs`, `encodeSave` (keep `"version"` first), `snapshotForSave` (`autosave.ts:123`), `profileFromSave` (~215), `main.ts:178-195` allow-lists. Tests copy `save-v4.test.ts` worst-case (545-606) and frozen-classifier (620-660) patterns.

### `src/ui/station-model.ts` (F3, F5)

**Analog:** `buildOutfittingModel` (915-1051): emit the repair row where the buy row would be, via `checkRepair`; label `Repair: ${item.name}`; detail `${item.description} (Price is for repairing the existing system).`; add a model verb field instead of the hard-coded `Buy ${row.name} for ...` prompt (`station-controller.ts:~708`). F5 analog `buildStatusModel` (552-632): prepend `${name} (damaged)` for each `profile.damagedEquipment` before the other items. Probe: widen `lastTrade.kind` (`probe.ts:185-190`) with `"repair"`.

### Content build

**Analog:** `tools/oolite-ingest/convert/equipment.ts` `project()` reading `purchase_sort_order`; add strict `damageProbability: z.number().min(0)` to `src/content/schemas/equipment.ts` (0 for `_MISSILE`/`_MINE`/external stores, default 1.0). Regenerate with `docker compose run --rm assets`; update golden `tests/golden/content/equipment.json` and the converter test.

## Shared Patterns

### Immutable profile replacement, identity on refusal
**Source:** `src/sim/player/outfitting.ts` `check*`/`apply*` and `commitProfile` above. **Apply to:** `damage.ts`, `applyRepair`, `damageFlow`.

### Read-only per-step facts, sim never sees the profile
**Source:** `CombatOptions` `mounts`/`hulls`/`debris`. **Apply to:** `internalDamage` facts.

### Closed sets grow with their pins
Router table (typecheck forces completeness), `session-order.test.ts`, probe shape fixture, HUD length guard (`tests/guards/hud-message-length.test.ts`, max 60 chars), `RNG_PURPOSE_CODES` vector. Never edit pinned twin literals to make a test pass.

### FIDELITY.md contract
Each row needs a `src/...:line` cell, an Oolite `src/Core/...:a-b` range (<= 20 lines) with one matching `### E-nnn` excerpt, and a Key Decisions substring for divergences. Next id is E-154. Divergence rows: D-05 (factor 95 constant, cosmetic branch unported), F5 "(damaged)". The row for "Repair: X" is not a divergence (Oolite renders the space).

## No Analog Found

| File / Behaviour | Role | Data Flow | Reason |
|---|---|---|---|
| D-06 autopilot disengage, galactic jump abort, ANA chart | n/a | n/a | No engaged autopilot (Shift+C docks instantly), no galactic jump, no ANA consumer exist. Compass fallback already works via `options.equipment` (`flight/step.ts:168-176`); add guard tests only. |

## Metadata

**Analog search scope:** `src/sim/combat`, `src/sim/rng.ts`, `src/sim/economy`, `src/sim/player`, `src/persistence`, `src/app/session`, `src/ui`, `tests/persistence`, `tests/app/session`
**Tracked-source check:** all analog paths are under tracked `src/`, `tests/`, `tools/`; none are install or runtime mirrors.
**Pattern extraction date:** 2026-11-21
