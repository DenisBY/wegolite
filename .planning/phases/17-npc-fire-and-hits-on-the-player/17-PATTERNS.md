# Phase 17: NPC Fire and Hits on the Player - Pattern Map

**Mapped:** 2026-11-18
**Files analyzed:** 22 (new or modified)
**Analogs found:** 21 / 22

All analog paths below were checked as tracked source under `src/` and `tests/` (no capability mirrors involved). Line numbers refer to the files as read on 2026-11-18.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/sim/npc/fire.ts` (new) | utility (pure gate, onTarget, cooling) | transform | `src/sim/npc/target.ts` (`currentAimTolerance`) + `tracking-curve.ts` | role-match |
| `src/sim/npc/dispatch.ts` | contract (SteerContext) | request-response | itself (add optional `fire`) | exact |
| `src/sim/npc/behaviours/{evasive,attack-evade,attack-close,attack,flee}.ts` | behaviour | event-driven (per-tick) | the files themselves (cut-site comments) | exact |
| `src/sim/npc/{target,track,constants}.ts` | utility / config | transform | themselves | exact |
| `src/sim/combat/step.ts` (`drainFireQueue`, cooling, missedShots) | service | batch | `rechargeShips` in same file (204-243) | exact |
| `src/sim/world/step.ts` (`steerEntity`) | service | request-response | itself (238-261) | exact |
| `src/sim/ai/pilots/test-pilot.ts` | AI module | event-driven | itself (`createTestPilotAi`, `hold`) | exact |
| `src/sim/ai/pilots/flight-script.ts` | AI module | event-driven | `test-pilot.ts` (conditional `fire` param) | role-match |
| `src/sim/ai/test-spawn.ts` (`spawnTestAttacker`) | utility (spawn helper) | CRUD | `spawnTestShooter` (79-111) | exact |
| `src/app/probe.ts`, `src/app/session/probe-publisher.ts` | hook | request-response | `spawnShooter` / `spawnFlyers` there | exact |
| `tests/fixtures/probe-shape.json`, `tests/app/probe-shape-compare.test.ts`, `tests/app/session/probe-publisher.test.ts` | test | request-response | `spawnTestFlyers` rows in each | exact |
| `tests/oracles/npc/fire/**` (schema, fixtures, derive, self test) | test (oracle) | transform | `tests/oracles/npc/{schema.ts,reference/*,pursuit/derive.ts,reference.self.test.ts}` | exact |
| `tests/sim/npc/fire.oracle.test.ts` | test | transform | `tests/sim/npc/attack.oracle.test.ts` + `oracle-runner.ts` | exact |
| `tests/sim/npc/{oracle-groups.ts,oracle-coverage.test.ts,constants.test.ts}` | test | transform | themselves | exact |
| `tests/sim/npc/fire-cadence.test.ts` (new) | test | batch | `tests/sim/npc/npc-cadence.test.ts` | exact |
| `tests/sim/npc/fire.property.test.ts` (new) | test | transform | `steering.property.test.ts`, `kill.property.test.ts` | role-match |
| Vitest scenarios (NPC vs NPC, mutual kill) | test | event-driven | `tests/sim/npc/flyers.scenario.test.ts`, `step-integration.test.ts` | role-match |
| `tests/guards/{kill-credit,ship-hit,on-event}-*.test.ts` (3 new) | test (guard) | transform | `tests/guards/entity-id-scope.test.ts` | exact |
| `tests/guards/fire-decision-source.test.ts` (optional, recommended) | test (guard) | transform | `tests/guards/entity-id-scope.test.ts` | exact |
| `tests/e2e/*` one opt-in spec (hook shooter to HUD) | test (browser) | request-response | `tests/e2e/combat.spec.ts` | exact |
| `.planning/todos/pending/*` (2 new, 1 amended), PROJECT.md rows, CHANGELOG | docs | n/a | existing todo `2026-11-17-skip-shiphit-for-a-doomed-target.md` | role-match |

## Pattern Assignments

### `src/sim/combat/step.ts` `drainFireQueue` (the single gate site)

**Analog:** same file, current ungated drain (204-227) and `rechargeShips` (234-243).

Current ungated drain, to be replaced by the gate (sort ascending, clear queue, skip dead and non-ship, weapon lookup, ray, `ShotRequest`):

```typescript
const queued = [...world.fireQueue].sort((a, b) => a - b);
world.fireQueue.length = 0;
const shots: ShotRequest[] = [];
if (!worldStepped) return shots;
const weapons = options?.combat?.npcWeapons;
if (weapons === undefined) return shots;
for (const id of queued) {
  const shooter = world.store.get(id);
  if (shooter === undefined || shooter.dead || shooter.kind !== "ship") continue;
  const weapon = weapons.get(shooter.specKey);
  if (weapon === undefined || weapon.laser === NO_LASER) continue;
  const ray = npcLaserRay(shooter, weapon);
  if (ray === null) continue;
  shots.push({ shooter: id, ray, laser: weapon.laser });
}
```

Careful: Oolite takes one draw even for an unarmed ship or no target (RESEARCH Q1), so the `weapon.laser === NO_LASER` and `ray === null` `continue`s must move to after the gate's draw, or the gate call must happen first. Draw from `createRngState(shooter.rng.combat)` / `rngNext`, then write back `shooter.rng.combat = stream.s` (pattern in `world/step.ts:245-260`).

Cooling pattern, copy the loop shape of `rechargeShips` (live loop, skip dead and non-ship), run it after the drain and after `rechargeShips` (line 277-278):

```typescript
for (const entity of world.store.live) {
  if (entity.dead || entity.kind !== "ship") continue;
  ...
}
```

Resolve loop where `missedShots` is updated (308-321): `for (const shot of all.sort(byShooter)) { ... const hit = firstShipHit(...)`; `hit === null` means miss (+1), hit means -1, floored at 0.

### `src/sim/world/step.ts` `steerEntity` (builds `ctx.fire`)

**Analog:** same file 238-261.

```typescript
const stream = createRngState(entity.rng.combat);
steerShip(entity, {
  view,
  stats: statsFor(npc?.flight, entity.specKey),
  dt,
  draw: () => rngNext(stream),
  emit: (event) => { postAiEvent(world, ...); },
});
entity.rng.combat = stream.s;
```

Add `...(entity.ai?.params.fire === true ? { fire: () => queueFire(world, entity.id) } : {})` (conditional spread because `exactOptionalPropertyTypes` is on). Do NOT cool here (cooling runs after the gate in the combat step). The queue push must use the same de-dup rule as `control-impl.ts:122-129`:

```typescript
fire(id: EntityId): void {
  ...
  if (world.fireQueue.length >= MAX_ENTITIES) return;
  if (world.fireQueue.includes(id)) return;
  world.fireQueue.push(id);
}
```

Extract one shared helper rather than duplicating it.

### `src/sim/npc/dispatch.ts` (`SteerContext`)

**Analog:** lines 89-100. Add one optional member in the same documented style:

```typescript
export interface SteerContext {
  readonly view: WorldView;
  readonly stats: NpcFlightStats;
  readonly dt: number;
  readonly draw: () => number;
  readonly emit: (event: SteerEvent) => void;
  /** Present only for a pilot that opted in; asks the gate to fire. */
  readonly fire?: () => void;
}
```

Test harness contexts (`tests/sim/npc/attack-support.ts`, `oracle-runner.ts`, `steering.property.test.ts`) keep compiling because it is optional. Behaviours call `ctx.fire?.()`.

### `src/sim/npc/behaviours/attack-evade.ts` (sniper fix, break-off)

**Analog:** itself. Sniper early return to fix (lines 87-90) so the tail (cloak, fire, hot read) is shared as in Oolite 4413-4458:

```typescript
if (range < SNIPER_BOUNCE_RANGE) {
  nav.behaviour = "ATTACK_TARGET";
  return;            // <- becomes if/else; Oolite falls through to fireMainWeapon at 4454
}
```

Break-off hand-over (line 181-184) replaces the constant with the entity field:

```typescript
approachAspectToPrimaryTarget(entity, ctx) < BREAK_OFF_HAND_OVER_ASPECT &&
NPC_WEAPON_TEMP < NPC_WEAPON_TEMP_READY      // -> entity.weapon.temperature
```

Read the temperature before this tick's shot and cooling (it is, because the drain runs after steering).

### `src/sim/npc/behaviours/attack.ts` (dispatcher)

**Analog:** itself, line 158-183: `forwardWeaponTemp: number = NPC_WEAPON_TEMP` parameter; feed `entity.weapon.temperature` and keep the `forwardWeaponTemp < NPC_WEAPON_TEMP_READY` / `_USABLE` comparisons at 178 and 183.

### `src/sim/npc/{evasive,attack-close,flee}.ts`

**Analog:** each file's header comment marks the cut site (evasive 4035, six 4575, fly-to 4711, flee 4891 unreachable turret-only). Port as `ctx.fire?.()` at the cut, then the hot-weapon read right after (attack-close 4577 and 4713 per RESEARCH Q2 table). Do not add an `if (target)` guard before the evasive fire call (it removes a draw Oolite takes). Flee stays unreachable, record it.

### `src/sim/npc/target.ts` `currentAimTolerance` and `track.ts`

**Analog:** target.ts 113-130 (comment "missedShots is 0"), track.ts 285 and 399-400. Apply `basic_aim /= 1.0 + missedShots / 4.0` (ShipEntity.m:9769) and the `min_d -= 0.0001 * missedShots` branch with the 0.001 floor (9134-9141); both exact no-ops at 0. Read `missedShots` from `entity.weapon.missedShots`.

### `src/sim/npc/fire.ts` (new)

**Analog (partial):** `src/sim/npc/target.ts` for the pure, total, Oolite-cited style (header comment with `ShipEntity.m` line cites, `Math.fround` for float32 fields per Phase 14 rule 15) and `src/sim/npc/tracking-curve.ts` `calculateTargetPosition` as an input to `onTarget`. Gate shape: see RESEARCH Pattern 1 sketch. Constants: reuse `NPC_MAX_WEAPON_TEMP`, `WEAPON_COOLING_*` from `src/sim/npc/constants.ts` (364-373), and `LASER_STATS` from `src/sim/combat/constants.ts` (`rechargeTicks` already holds `round(rate*120)`). Delete `NPC_WEAPON_TEMP` and amend `tests/sim/npc/constants.test.ts` in the same plan.

### `src/sim/ai/pilots/test-pilot.ts`

**Analog:** itself.

Conditional param (line 75), copy to `flight-script.ts`:

```typescript
...(options.fire === true ? { fire: true } : {}),
```

`hold` today (lines 117-129) asks to fire only on the 15-tick think. Change per D-08/D-09 and RESEARCH Q4: in `hold`, set the target once (`if (view.ship(self)?.targetId !== targetId) ctl.setTarget(self, targetId)`), and when `ai.params.fire === true` call `ctl.scheduleWake(self, 1)` then `ctl.fire(self)`. The end-of-think `ctl.scheduleWake(self, ticks(0.1 + random() * 1.5))` cannot push later (never-later rule). Add no `ShipControl` member (pinned by `tests/sim/world/control.test.ts`).

### `src/sim/ai/pilots/flight-script.ts`

**Analog:** `test-pilot.ts` `createTestPilotAi` options and param spread. Add `fire?: boolean` with the same conditional key; the existing `params` has `script, phase, targetId, range, speed, frustrated`. Existing worlds must hash byte-identically.

### `src/sim/ai/test-spawn.ts` `spawnTestAttacker`

**Analog:** `spawnTestShooter` (79-111):

```typescript
if (!isScanClass(record.scanClass)) return false;
const nose = rotate(player.orientation, LOCAL_FORWARD);
const ai = createTestPilotAi(tick, { fire: true, holdRange: TEST_SHOOTER_HOLD_RANGE });
ai.params.phase = "hold";
ai.params.targetId = PLAYER_ID;
return spawnEntity(world, { kind: "ship", specKey: record.key, scanClass: record.scanClass,
  position: add(player.position, scale(nose, TEST_SHOOTER_DISTANCE)),
  orientation: normalize(mul(player.orientation, HALF_TURN_ABOUT_UP)),
  radius: record.radius, speed: 0, ai, maxEnergy: record.maxEnergy,
  energyRechargeRate: record.energyRechargeRate,
  ...(cargo === undefined ? {} : { cargo }) }, tick).ok;
```

The attacker uses `createFlightScriptAi(tick, { script: "attack", targetId: PLAYER_ID, fire: true })` and a non-zero speed. Also consider shortening `TEST_SHOOTER_DISTANCE` (1,500, D-04).

### Hook: `src/app/probe.ts`, `src/app/session/probe-publisher.ts`

**Analog:** `spawnShooter` (`TEST_SHOOTER_KEY = "viper"`, `markHookMutation()` before the world is touched) and `spawnFlyers`; `probe.ts` `WegoliteSimTestHook` declares the member and sets `hook.tainted = true` after success. Recommended name `spawnTestAttacker(): boolean`. Update `tests/fixtures/probe-shape.json` (member listed twice, near lines 1139 and 1366), `tests/app/probe-shape-compare.test.ts:244-245`, `tests/app/session/probe-publisher.test.ts` (copy the `spawnTestFlyers` describe).

### Oracle family `tests/oracles/npc/fire/**`

**Analog:** `tests/oracles/npc/schema.ts` (strict zod, kebab-case ids, `oolite` citations matching `^(?:src/Core|Resources)/...:a-b$`, `derivation`, scripted `draws`, `checks`, `events`), `tests/oracles/npc/reference/*.ts` and `pursuit/derive.ts` (independent derivation, imports nothing from `src/`), `reference.self.test.ts` (re-derives every expected value). Own schema file, since `OracleFixtureSchema` has no weapon fields (needs `self.missedShots`, `self.forwardWeaponTemp`). Must pass `tests/guards/oracle-independence.test.ts` (only `node:`, `zod`, `vitest`, oracle tree). The independent agent must not read `src/sim/npc/**`.

### `tests/sim/npc/fire.oracle.test.ts`, `oracle-groups.ts`, `oracle-coverage.test.ts`

**Analog:** `tests/sim/npc/attack.oracle.test.ts` with `oracle-runner.ts`. Manifest pattern in `oracle-groups.ts`:

```typescript
export interface OracleGroup { readonly fixtureFile: string; readonly testFile: string; }
const ATTACK_TEST = "tests/sim/npc/attack.oracle.test.ts";
```

Add a `FIRE_TEST` constant and one row per new fixture file; `oracle-coverage.test.ts` compares manifest to disk. Note `attack.oracle.test.ts:36-47` and `attack-dispatch.test.ts:94` assert "steering never fires" for non-opted-in contexts; keep true.

### `tests/sim/npc/fire-cadence.test.ts`

**Analog:** `tests/sim/npc/npc-cadence.test.ts` (tick-indexed `hashWorld` log, its own copy of the frame runner, 30/60/144 Hz, `spawnTestFlyers` at a fixed tick). Swap in an opted-in attacker.

### Guards `tests/guards/*.test.ts` (D-13 x3, plus decision-source)

**Analog:** `tests/guards/entity-id-scope.test.ts`: `readdirSync`/`readFileSync` over `src`, local `withoutComments(source)` helper that preserves newlines, a named failure-message constant, repo-relative posix paths:

```typescript
const REPO_ROOT = process.cwd();
const SRC_DIR = join(REPO_ROOT, "src");
const IMPORT_RULE = "imports src/sim/world/ids: no entity id outlives its world (...)";
function withoutComments(source: string): string { ... }
```

Concrete detection (RESEARCH Q4): (1) scan for `shipTargetDestroyed`, `shipKilledOther`, `.killer` reads outside `kill.ts`, `events.ts`, `ai/types.ts`, `combat/ledger.ts`, `combat/step.ts`; (2) `shipHit` literal outside `events.ts` and `ledger.ts`, plus `src/app`; (3) runtime `Object.values(AI_REGISTRY).filter((m) => m.onEvent !== undefined).length <= 1`. Each failure message must name its todo path under `.planning/todos/pending/`. Decision-source guard: no file under `src` besides `test-spawn.ts` and the two pilot modules references `createTestPilotAi`, `createFlightScriptAi`, and `populate.ts` has only `ai: null`.

### Browser spec (hook shooter to HUD)

**Analog:** `tests/e2e/combat.spec.ts` (opt-in `?test=1`, manual clock, probe `combat.fwdShield` / `combat.energy`). Step a bounded number of ticks and wait for the shield to drop (D-04); no first-tick hit expectation. Runs against `npm run build:e2e`, on the remote machine via the wrapper script.

## Shared Patterns

### Own-stream draw (determinism)
**Source:** `src/sim/world/step.ts:245-260`
**Apply to:** the gate site in `combat/step.ts`, behaviour `ctx.draw`.
```typescript
const stream = createRngState(entity.rng.combat);
... draw: () => rngNext(stream) ...
entity.rng.combat = stream.s;
```

### Param key present only when set (hash stability)
**Source:** `src/sim/ai/pilots/test-pilot.ts:75`
**Apply to:** `flight-script.ts`, `spawnTestAttacker`.

### Cut-site comment to port (Oolite line cites in header comments)
**Source:** `src/sim/npc/behaviours/*.ts` headers; `target.ts:113-130`.
**Apply to:** every ported branch (cite `ShipEntity.m` lines; record unreachable branches).

### Totality and fast-check
**Source:** `tests/sim/npc/steering.property.test.ts`, `tests/sim/combat/kill.property.test.ts` (Pitfall 16). Every new sim function (gate, onTarget, cooling) is total (NaN refuses) and covered by a property test.

### Float32 temperature
**Source:** Phase 14 rule 15 (`Math.fround` on float32 fields), `Math.fround(0)` usage at `attack-evade.ts:187`. Apply to every `weapon.temperature` write.

### Hit, ledger, kill (no new rule)
**Source:** `src/sim/combat/{hit,ledger,shields}.ts`, `src/sim/world/kill.ts`. NPC shots only produce `ShotRequest`s; mutual-kill scenario feeds `resolveShots` explicit shots (its `shots` parameter) for determinism.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/sim/npc/fire.ts` gate state machine | utility | transform | No existing heat/timer/energy gate in the codebase; the player's gate (`stepPlayerCombat`) uses strict `>` and different tick quantisation, so use RESEARCH Pattern 1 and the Oolite source (`ShipEntity.m:9912-9993`) instead. Style analog only: `target.ts`. |

## Metadata

**Analog search scope:** `src/sim/{npc,combat,world,ai}`, `src/app`, `tests/{guards,sim/npc,oracles/npc,e2e,app}`
**Files scanned:** about 25 read in part or in full; remainder of RESEARCH.md (lines 359-617, Q6 and open questions) was not read.
**Pattern extraction date:** 2026-11-18
