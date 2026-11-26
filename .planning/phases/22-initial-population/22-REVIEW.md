---
phase: 22-initial-population
reviewed: 2026-11-26T00:00:00Z
depth: standard
files_reviewed: 73
files_reviewed_list:
  - CHANGELOG.md
  - docs/PERFORMANCE.md
  - FIDELITY.md
  - src/app/session/start-session.ts
  - src/app/session/traffic.ts
  - src/content/schemas/ship-npc.ts
  - src/sim/rng.ts
  - src/sim/world/limits.ts
  - src/sim/world/neighbourhood.ts
  - src/sim/world/placement.ts
  - src/sim/world/population/escorts.ts
  - src/sim/world/population/groups.ts
  - src/sim/world/population/kit.ts
  - src/sim/world/population/pirates.ts
  - src/sim/world/population/plan.ts
  - src/sim/world/population/police.ts
  - src/sim/world/population/spawn.ts
  - src/sim/world/population/streams.ts
  - src/sim/world/population/table.ts
  - src/sim/world/population/traders.ts
  - src/sim/world/world.ts
  - tests/app/session/death-twin.test.ts
  - tests/app/session/probe-publisher.test.ts
  - tests/app/session/sim-driver.test.ts
  - tests/app/session/tick-flyers.test.ts
  - tests/app/session/tick-parity.test.ts
  - tests/app/session/traffic.test.ts
  - tests/app/session/world-lifecycle.test.ts
  - tests/content/ships-npc.test.ts
  - tests/contract/fidelity.test.ts
  - tests/e2e/anarchy.spec.ts
  - tests/e2e/combat.spec.ts
  - tests/e2e/npc-flight.spec.ts
  - tests/e2e/population-anarchy.spec.ts
  - tests/e2e/tick-hook.spec.ts
  - tests/e2e/traffic.spec.ts
  - tests/guards/pod-kind-fallback.test.ts
  - tests/helpers/glb-triangles.ts
  - tests/helpers/launch-corridor.ts
  - tests/helpers/population-census.ts
  - tests/helpers/population-fixtures.ts
  - tests/helpers/tick-script.ts
  - tests/helpers/traffic-fixture.ts
  - tests/helpers/write-population-census.ts
  - tests/oracles/population/codec.ts
  - tests/oracles/population/population.self.test.ts
  - tests/oracles/population/schema.ts
  - tests/sim/rng.test.ts
  - tests/sim/world/groups-prune.test.ts
  - tests/sim/world/neighbourhood.test.ts
  - tests/sim/world/placement.test.ts
  - tests/sim/world/population/cadence.test.ts
  - tests/sim/world/population/cargo-kind.test.ts
  - tests/sim/world/population/census.test.ts
  - tests/sim/world/population/debris-reserve.test.ts
  - tests/sim/world/population/groups.oracle.test.ts
  - tests/sim/world/population/kit.test.ts
  - tests/sim/world/population/launch-corridor.test.ts
  - tests/sim/world/population/plan.oracle.test.ts
  - tests/sim/world/population/spawn.test.ts
  - tests/sim/world/population/traders.oracle.test.ts
  - tests/sim/world/sanitize.test.ts
  - tests/sim/world/snapshot-codec.test.ts
  - tests/sim/world/v5-cadence.test.ts
  - tools/ai-harness/population-systems.ts
  - tools/ai-harness/populator-host.ts
  - tools/ai-harness/populator-record.test.ts
  - tools/ai-harness/populator-record.ts
  - tools/oolite-ingest/convert/npc-ships.test.ts
  - tools/oolite-ingest/convert/npc-ships.ts
  - tools/oolite-reference/README.md
  - tools/oolite-reference/steps/census-anarchy.steps
  - tools/oolite-reference/steps/census-quiet.steps
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
  necessity: 2
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-11-26
**Depth:** standard
**Files Reviewed:** 73
**Status:** issues_found

## Summary

I reviewed the production source under `src/` in full and in context. That covers the planner (`plan.ts`), the builders (`kit.ts`, `escorts.ts`, `traders.ts`, `pirates.ts`, `police.ts`), the stream forks (`streams.ts`), the spawn path (`spawn.ts`), the neighbourhood (`neighbourhood.ts`), the session wiring (`traffic.ts`, `start-session.ts`, and the hyperspace and world-lifecycle call sites), and the `world.ts`, `limits.ts`, `placement.ts` and `rng.ts` changes. I checked the port line by line against upstream `Resources/Scripts/oolite-populator.js`, `Universe.m` (`addShipAt`, `populateSystemFromDictionariesWithSun`, `locationByCode`, `getContainersOfGoods`), `ShipEntity.m` (`setUpMixedEscorts`, `setUpOneEscort`, `setCargoFlag`, `setUpShipFromDictionary`) and `OOProbabilitySet.m`.

I traced these against upstream and found no divergence:
- the rate arithmetic and its operator order
- the `couriers *= 1.5` quirk
- `randomise`
- the escort set-up loops, including negative `min`, the empty-role slot counting, and the trader escort removal
- `setWeapons`, `setSkill` and the weighted record pick
- the pirate pack and independent pirate flows
- the cargo-count rule
- the group-record linking and the contiguous-id assumption, which holds because `store.allocate` increments by 1

The `addShipAt` witchpoint branch is not modelled. It changes only data the script overwrites afterwards: the cargo flag, the pirate bounty and the AI.

I found no crash, data-loss or security defect in the production path. Two Warnings remain:
- `buildNeighbourhood` is not total for extreme chart coordinates, although the arrival install block relies on that.
- The stream divergence (assumption A8) has no `FIDELITY.md` row, although the project fidelity rule requires one.

The Info items are stale contracts and comments, one latent galaxy-mismatch hazard, and two necessity observations. Tests, fixtures and tooling showed no reliability defects: no skipped or `.only` tests, no timing sleeps in place of waits, and no vacuous assertions. The oracle replay is only as independent as the stub host `tools/ai-harness/populator-host.ts`. I read its escort and pick pieces against the engine source and they match.

Fallow structural findings were not provided. Tests were not run; this review is static, with one arithmetic check of `chartDistance` behaviour done by hand.

## Warnings

### WR-01: `buildNeighbourhood` can throw for extreme integer chart coordinates, though the arrival install block relies on it being total

**File:** `src/sim/world/neighbourhood.ts:96-98` (also `115-125`, `133-141`)
**Issue:** The header (lines 28-31) and `createSystemPopulate` (traffic.ts:468-472) claim the module never throws. They say the `RangeError` of `chartDistance` is "unreachable" because a malformed record is dropped first. The drop test is only `isChartCoordinate`, which is `typeof === "number" && Number.isInteger(value)`. That admits every integer-valued double, including magnitudes of 6.4e15 and above, and 1e300.

`chartDistance` (`src/sim/hyperspace/jump.ts:81-97`) computes `Math.trunc(Math.sqrt(dx*dx + dy*dy))` and throws a `RangeError` when the result is not a safe integer. For example, `chartX` of 9e15 and -9e15 gives `dist` of 1.8e16, which is not safe. For `chartX` of 1e300, `dx*dx` overflows to `Infinity` and it throws as well.

The content schema does not stop this: `src/content/schemas/system.ts:41` is `chartX: z.number().int()` with no bounds. So the stated invariant ("content is validated, the throw is unreachable") is not enforced by the type or the schema.

The consequence is not benign. `worldLifecycle.begin` runs `populate` inside the arrival's synchronous install block (`hyperspace-controller.ts:~253-263`), after `ctx.core.profile`, `market` and `marketSeed` were assigned. A throw there leaves the arrival half-applied: `begin` builds before it commits, but the profile and market are already replaced and the scene, system and layout have already switched. This is exactly what `world-lifecycle.ts` rule (ii) forbids.

The existing property test (`tests/sim/world/neighbourhood.test.ts:344-396`) does not catch it. It draws `chartX` from `weirdNumber` (rarely an integer-valued huge double that also pairs with a valid `systemIndex`) and from a 0..255 integer branch.

I confirmed the `dist` arithmetic by hand. I did not run a test.

**Fix:** Bound the coordinate to the chart's real domain (a byte in Oolite) so `chartDistance` cannot overflow, and tighten the schema to match:
```ts
function isChartCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 255
  );
}
```
Also add `.min(0).max(255)` to `chartX` and `chartY` in `src/content/schemas/system.ts`. Add a property-test case with `fc.integer({ min: -2**53, max: 2**53 })` coordinates and two valid indices, asserting `buildNeighbourhood` does not throw.

### WR-02: The per-entry / per-group / per-site RNG stream design (assumption A8) is a divergence with no `FIDELITY.md` row

**File:** `src/sim/world/population/streams.ts:1-26` (recorded only in `.planning/PROJECT.md:374`; absent from `FIDELITY.md:231-243`)
**Issue:** `AGENTS.md` states the fidelity rule: any divergence from Oolite needs "a `FIDELITY.md` row [that] records the reason". Oolite's populator draws everything from one global `Math.random`/`Ranrot` stream. The port replaces that with stateless forked streams (RNG purpose `pop`, code 10; `countDraws`, `populationDraws`, `populationStream`). `streams.ts` says the result is "statistically equal to Oolite, not stream-equal".

That is a deliberate behavioural divergence. Seeded arrivals no longer reproduce Oolite's draw sequence, and a count no longer depends on earlier draws. It is recorded in `PROJECT.md` Key Decisions but not in `FIDELITY.md`. The population block there (rows 231-243) has rows for the sort order, the cuts, the group merge, the station patrol and the entity cap, but none for the streams.

The sibling case, the player damage stream, does have a row (`FIDELITY.md:3595`, "Damage stream purpose code"). Same gap for the kind-keyed cargo count (`spawn.ts:191-207`, ported from `ShipEntity.m:7323-7375`): it is a faithful port, so no row is required by the rule, but the stream choice behind its draws is covered by the same missing row.

**Fix:** Add one `FIDELITY.md` row, for example "Initial population: random draws come from forked per-entry, per-group and per-site streams of the world seed (`pop`, code 10), not Oolite's one global stream". Its Wegolite cell would be `src/sim/world/population/streams.ts:41`. Its Oolite cell would cite the global `Math.random` use (for example `Resources/Scripts/oolite-populator.js:644-653`). Its Fidelity cell would be "divergence", with the statistical-equality reason and the pitfall C4 reasoning (adding or skipping a group moves no other group's draws).

## Info

### IN-01: Stale contracts and comments still describe the inert populator

**File:** `src/app/session/hyperspace-controller.ts:253`, `src/app/session/world-lifecycle.ts:43-58`, `src/sim/world/population/groups.ts:70-75`
**Issue:** Three comments no longer match the code after this phase.
- `hyperspace-controller.ts:253` says "the inert populator is total (rule ii of the world lifecycle)". The session now installs `createSystemPopulate`.
- `world-lifecycle.ts:43-58` states rule (ii) in terms of `populateInertWorld`. Rule (iii) says the post-populate counter "is 113 with traffic on (the 12 inert ships take ids 101 to 112)". With the system populator the counter is `101 + ships` and varies by system and epoch (28 ships for Lave at epoch 1, for example). The tests were re-pinned but the module contract was not updated.
- `groups.ts:70-75` says `fuel` is "tenths of a light year (the record's `fuel` times 10)". The record's `fuel` is already tenths (the catalogue holds 70 for 7 LY, and `traffic.ts:267` maps it unscaled). The trailing "times 10" reads as a conversion that does not exist.

**Fix:** Reword the rule (ii) and (iii) text to cover the system populator and the variable counter. Replace the `groups.ts` parenthetical with "(the catalogue's `fuel`, already tenths)".

### IN-02: Names and duplicated total-read helpers

**File:** `src/sim/world/population/plan.ts:117-134`, `src/sim/world/population/kit.ts:78-98` and `523-537`
**Issue:**
- `plan.ts` defines `read`, `num`, `list` and `finiteOrZero`, which duplicate `readField`, `numberOf` and `listOf` in `kit.ts` almost line for line. `kit.ts` imports only types from `plan.ts`, so `plan.ts` could import the helpers from `kit.ts` without a runtime cycle.
- `kit.ts` exports `chartDistance(facts)`, which returns a closure over `facts.neighbourhood.distanceTo`. `neighbourhood.ts` imports a different function of the same name from `hyperspace/jump.ts`. Two unrelated `chartDistance` identifiers in one feature invite a wrong auto-import.

**Fix:** Share the helpers from one module. Rename the `kit.ts` function, for example `homeDistanceOf(facts)`.

### IN-03: Latent galaxy mismatch between the arrival system and the neighbourhood list

**File:** `src/app/session/traffic.ts:490-495`, `src/app/session/start-session.ts:520-527`
**Issue:** `createSystemPopulate` builds the neighbourhood from `() => galaxy`, the session's one fixed galaxy list (`main.ts:322` passes `galaxy0()`), and the arrival's `systemIndex`. It never checks that `arrival.galaxy` is the list's galaxy.

`start-session.ts:533-534` explicitly handles `ctx.core.system` not being in the list (it adds it to `galaxyById`). If a system of another galaxy ever becomes current (galactic drive, a save from another galaxy), the populator silently takes galaxy-0 neighbours at the same index. The result is wrong rates and wrong home systems, with no error.

Unreachable today: there is no galaxy change in v2.4, and `game-session.ts:214` falls back to a one-system list when none is given. It is a trap for the later galaxy-jump work.

**Fix:** In `createSystemPopulate`, pass the neighbourhood list only when `arrival.galaxy` matches the list's galaxy, otherwise an empty list. Alternatively, make the galaxy getter take the arrival (`(galaxyIndex) => list`). Add a tripwire test for it.

### IN-04: Impossible-state guards in the spawn path

**Category:** necessity
**File:** `src/sim/world/population/spawn.ts:461-466` and `372`
**Issue:** Two branches defend states that cannot occur.
- `if (refused) { for (const id of spawnedIds) world.store.kill(id); ... }` is annotated "Unreachable after the trial spawn". A real `spawnEntity` could refuse only for `outOfDomain` or `malformed`, which the scratch-world `trialSpawns` has already ruled out for identical inits. It could also refuse for `idExhausted` or `storeFull`, which the `fits` test (`firstId + size - 1 <= MAX_UINT32`, `size <= limit - liveEntityCount`, with `limit <= MAX_ENTITIES`) already excludes. The branch also leaves dead entities in `store.items` until the next commit, so it would not be a clean rollback if it ever ran.
- `cargoKind: Math.max(0, CARGO_KINDS.indexOf(ship.cargoKind))` clamps a `-1` that cannot occur: `ship.cargoKind` is typed `CargoKindName`, a member of `CARGO_KINDS`. If it ever did occur, the clamp would turn the unknown kind into `unset` instead of failing, which is the masking behaviour the pod-kind guard exists to prevent.

The evidence is the `fits` guard at `spawn.ts:430-434`, the `domainRefusal` rules at `world.ts:635-725`, and the `CargoKindName` type. Removal is a scope decision.

**Fix:** Replace the rollback loop and the `Math.max` with a thrown `RangeError`, or keep them as documented invariants only. Do not add more recovery code.

### IN-05: Station-launch and repopulator branches with no caller

**Category:** necessity
**File:** `src/sim/world/population/traders.ts:114-119,267-271,297-301,334-336`, `kit.ts:303-313,512-517`, `src/app/session/traffic.ts:441-452`
**Issue:** The code carries paths with one instantiation (none today), kept for later phases.
- The `arriving: false` branches of the freighter, courier and smuggler builders, and `STATION_LAUNCH_FUEL`, are never reached. `buildGroup` defaults `arriving` to `true` and `planSystemGroups` (`groups.ts:299-305`) never passes it.
- `setReturnFuel` has no caller in `src/`.
- `roleExists` is documented as "dead with the shipped catalogue".
- `createInertPopulate` has no `src/` caller since `start-session.ts` switched to `createSystemPopulate`. Only tests use it, to keep the epoch 1-20 pin.

It is reachable only from tests. The rubric lists this as judgment (Info): the comments tie the first three to Phase 26 and the last to the frozen epoch pin.

**Fix:** Keep them if Phase 26 will use them. Otherwise remove the unused ones now, and pair any kept ones with a todo and a guard test that fails at the first consumer (the project's deferred-work rule).

---

_Reviewed: 2026-11-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
