---
phase: 15-damage-ledger-and-kills
reviewed: 2026-11-16T12:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - src/app/session/traffic.ts
  - src/content/schemas/ship-npc.ts
  - src/sim/combat/ledger.ts
  - src/sim/combat/shields.ts
  - src/sim/combat/step.ts
  - src/sim/events.ts
  - src/sim/npc/state.ts
  - src/sim/rng.ts
  - src/sim/sim.ts
  - src/sim/world/entity.ts
  - src/sim/world/kill.ts
  - src/sim/world/limits.ts
  - src/sim/world/populate.ts
  - src/sim/world/sanitize.ts
  - src/sim/world/serialize.ts
  - src/sim/world/snapshot.ts
  - src/sim/world/step.ts
  - src/sim/world/world.ts
  - tools/oolite-ingest/convert/npc-ships.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
  necessity: 2
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-11-16T12:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

I reviewed the source diff `094bf95..HEAD` for the 19 files in scope. I read each file in full where it changed, and I traced the kill path across files: `resolveShotHits`, `applyLedger`, `killShip`, `notifyKill`, `drainAiEventsNow`, the second `commitWorld` and `updateIdentTarget`. I also checked the v4 hash, snapshot and sanitiser fields against each other, and checked the cargo and converter ports against the Oolite checkout at `/home/opencode/git/oolite`.

I found no Critical issue. These parts are correct:

- **Determinism.** Ledger records apply in ascending shooter id. Lethal victims come back sorted with a numeric comparator. Kills resolve in ascending victim id. The immediate drain uses `player.tick`, the same tick `stepWorld` uses. `cleanOrientation` and the other cleaners are idempotent, so the extra sanitise pass on a kill tick changes nothing for an in-domain world.
- **Hash, snapshot and sanitiser domains match:**
  - `velocity`: magnitude up to `MAX_ENTITY_VELOCITY`.
  - `weapon.temperature`: `0..MAX_WEAPON_TEMPERATURE`.
  - `lastShotTick` and `missedShots`: uint32.
  - `cargo`: `0..MAX_ENTITY_CARGO`.
  - `staticHealth`: `0..max`.

  `-0` is normalised in every place. The pristine-omit segments print whenever any component is non-zero.
- **Totality.**
  - The store's `get` and `kill` filter dead entities and unknown ids, so `killShip`, `applyLedger` and `deliverAiEvent` all tolerate missing, dead, static and non-finite ids.
  - `populateInertWorld` guards the id before `forkSeed`. `createWorld` already validates `worldSeed`.
  - The world view filters dead entities, so a handler in the immediate drain cannot see a victim that is marked dead but not yet committed.
- **Oolite ports match their citations:**
  - The cargo count follows `setCargoFlag:` (`ShipEntity.m:7323-7373`).
  - The `weapon_facings` gating follows `ShipEntity.m:298-306`.
  - The killer's lost-then-destroyed order follows `removeTarget` → `noteLostTarget` (`ShipEntity.m:8673-8676`).
  - The limit constants `shipdata.plist:1018/1021/1732` and `ShipEntity.h:116` are cited correctly.
- **No import cycle.** `sanitize.ts` imports `world.ts`, and `world.ts` imports neither `sanitize.ts` nor `serialize.ts`.

The findings below are two module docs that now contradict the code, a duplicated credit rule, a fallback that disagrees with the sanitiser, and some converter code that cannot be reached.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `combat/step.ts` module doc says `resolveShots` reads no random stream, but it now runs AI handlers that draw from one

**File:** `src/sim/combat/step.ts:24` (contradicted by `src/sim/combat/step.ts:386`, `src/sim/world/step.ts:225-252`)
**Issue:** The module header still says "Neither function reads the clock or a random stream." That was true in Phase 13. Since plan 15-05, `resolveShots` calls `drainAiEventsNow`, and that call delivers `shipTargetLost`, `shipTargetDestroyed` and `shipKilledOther` through `invoke`:

- `invoke` builds `ctx.random` over the entity's `"ai"` stream: `createRngState(entity.rng.ai)`, then `rngNext`.
- It writes `entity.rng.ai = stream.s` back after the call.

So on any kill tick, `resolveShots` reads a hashed random stream and writes it back. This is a determinism claim, and a reader who trusts it may reorder `resolveShots` against other stream users, or may assume a kill leaves every `rng:` segment of the hash unchanged.
**Fix:** Replace the sentence with an accurate one, for example:
```ts
 * Neither function reads the clock. `stepPlayerCombat` reads no random stream;
 * `resolveShots` reads none itself, but the immediate AI drain it runs after the
 * kills (`drainAiEventsNow`) invokes `onEvent` handlers, which may draw from
 * (and write back) the receiving entity's own "ai" stream, exactly as in
 * `stepWorld`.
```

### WR-02: `stepSim` doc says a caller with no combat state gets "no resolution", but kills, the AI drain and the second commit run without one

**File:** `src/sim/sim.ts:55-57` (contradicted by `src/sim/sim.ts:124-135` and `src/sim/combat/step.ts:384-390`)
**Issue:** The doc reads: "A caller that passes none behaves exactly as before, with no combat step and no resolution." But `resolveShots` runs on every step whatever the value of `combat`. With `combat` undefined and the world stepped, it still does all of the following:

- drains `world.fireQueue`
- recharges every ship
- resolves NPC shots against NPCs
- applies the ledger and kills ships through `killShip`
- runs `drainAiEventsNow` and the second `commitWorld`

The `resolveShots` doc even says the commit is "gated on the world, never on `combat`" (`combat/step.ts:341-343`). The sim.ts sentence was already inexact for Phase 13 NPC fire. Phase 15 makes the gap a structural one: a no-combat caller can now see `shipDestroyed`, a second `entityRemoved` group and `aiFaulted` events. That is the opposite of "exactly as before".
**Fix:**
```ts
 * Combat (CBT-04 to CBT-07, DOCK-10): the optional trailing `combat` state is
 * the player's views, lasers, shields and energy. Without it there is no player
 * combat step and the player is never a hit candidate, but `resolveShots` still
 * runs: NPC shots resolve, damage applies, lethal ships are destroyed and
 * removed on the tick, and their AI events are drained.
```

## Info

### IN-01: The killer-credit rule is implemented twice; the ledger's `creditedKiller` is redundant with `normaliseKiller`

**File:** `src/sim/combat/ledger.ts:136-143`, `src/sim/world/kill.ts:76-88`
**Issue:** `creditedKiller` returns `PLAYER_ID` for a player source, `NO_ENTITY` for a self-hit, and otherwise the source only when `store.get(source)?.kind === "ship"`. `killShip` then passes that result through `normaliseKiller`, which applies the same three rules again, plus a range check. At ledger time no ship of the tick is dead yet, so the ledger's version never gives a different answer from `normaliseKiller(world, victim, record.source)` at kill time. The only exception is the same-pass death, and `normaliseKiller` already handles that. Keeping two copies of the rule invites drift; for example, only the kill-side copy has the safe-integer guard. Inside `normaliseKiller`, the `Number.isSafeInteger` / `0..MAX_UINT32` branch is also subsumed by the store lookup: `indexOfId` never matches a non-integer or out-of-range id, and `NO_ENTITY` (0) is never stored.
**Fix:** Have the ledger record the raw `record.source` of the first lethal record (`lethal.set(record.target, record.source)`), and let `killShip`/`normaliseKiller` be the single place that turns a source into credit. The `MAX_UINT32` import and range branch in `kill.ts` can then shrink to `killer === PLAYER_ID ? PLAYER_ID : killer !== victim && world.store.get(killer)?.kind === "ship" ? killer : NO_ENTITY`.

### IN-02: The ledger treats a non-finite energy as 0 (instantly lethal) while the sanitiser heals it to a full bank

**File:** `src/sim/combat/ledger.ts:117` (compare `src/sim/world/sanitize.ts:159-160`)
**Issue:** `const before = Number.isFinite(entity.energy) ? entity.energy : 0;` means any hit on a ship whose energy is NaN or Infinity is a kill. `cleanEnergy`, the project's single repair policy for this field, maps non-finite energy to `maxEnergy`. Under `stepSim` the state cannot occur: `stepWorld` sanitises just before, and `rechargeShips` only writes finite values. It can occur through the exported `applyLedger` (the totality tests call it directly). There, a corrupt value decides lethality and kill credit in the opposite direction from every other repair site. In Phase 13 the fallback was harmless because energy only floored. Since Phase 15 it decides a destruction.
**Fix:** Use the sanitiser's policy, `Number.isFinite(entity.energy) ? entity.energy : entity.maxEnergy`. Otherwise, document why a corrupt bank should die rather than heal.

### IN-03: Generality without instantiation: aft, port and starboard weapon types can never be anything but `EQ_WEAPON_NONE`

**File:** `tools/oolite-ingest/convert/npc-ships.ts:194-201`, `:379-388`, `:432-461`; `src/content/schemas/ship-npc.ts:96-101`
**Category:** necessity
**Issue:** `compileNpcShips` fails the build whenever `aft_weapon_type`, `port_weapon_type` or `starboard_weapon_type` is authored (the `STEERING_ASSUMED_ABSENT_KEYS` loop). It does this before `facingWeapon` runs. So the three `facingWeapon(..., "aft_weapon_type")`-style calls always take the `value === undefined` branch and return `DEFAULT_FACING_WEAPON`. Their mapping and failure branches cannot be reached from the converter; only the direct export test reaches them. No code under `src/` reads `aftWeapon`, `portWeapon` or `starboardWeapon` (rg finds only the schema). The three type fields are constants in every compiled record. This rests on judgement, because DATA-14 asks for them, so it is Info.
**Fix:** No change is needed if DATA-14's field list is binding. Otherwise compile the three types as the literal `"EQ_WEAPON_NONE"` with a comment that points at the refusal, and keep `facingWeapon` for the forward facing only until the refusal is lifted. The positions are still needed, because Oolite reads them whatever the mask says.

### IN-04: The fire-queue truncation in `drainAiEventsNow` serves a caller that does not exist

**File:** `src/sim/world/step.ts:335-337` (doc at `:292-297`)
**Category:** necessity
**Issue:** The function records `fireLength` and truncates back to it so that "a later in-step caller keeps the think phase's requests". The only caller is `resolveShots` (`combat/step.ts:386`; rg finds no other call in `src/` or `tools/`). It runs after `drainFireQueue` has already emptied the queue, so `fireLength` is always 0 and the code is `world.fireQueue.length = 0` with extra steps. The behaviour is correct. The generality is just unexercised, and the doc describes a contract that no caller has.
**Fix:** No change is needed if a second caller is planned (Phase 16 debris expiry?). Otherwise simplify to `world.fireQueue.length = 0` and say in the doc that the drain runs after the fire queue was consumed.

### IN-05: Minor converter code-quality nits

**File:** `tools/oolite-ingest/convert/npc-ships.ts:302`, `:316`, `:394-396`
**Issue:**
- `:302`: `FORWARD_WEAPON_KEYS[value] ?? DEFAULT_FACING_WEAPON`. The `??` fallback cannot be reached after `Object.hasOwn(FORWARD_WEAPON_KEYS, value)`, and the table is now used for all four facings, so the `FORWARD_` prefix misleads.
- `:316`: `return DEFAULT_EXPLOSION_TYPE as null;`. The constant is declared `readonly string[] | null` but is always `null`, which forces a cast.
- `:394-396`: `DEFAULT_WEAPON_FACINGS` is used both as the absent-key default and as the bit mask (`& DEFAULT_WEAPON_FACINGS`). Oolite names the mask `VALID_WEAPON_FACINGS`. The two roles are the same value only by coincidence of the default.

**Fix:** Rename the table to `WEAPON_KEYS` (or similar) and drop the `??` (use a non-null assertion or a typed lookup). Declare `DEFAULT_EXPLOSION_TYPE: null = null`. Add `const VALID_WEAPON_FACINGS = 15` and mask with it.

---

_Reviewed: 2026-11-16T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
