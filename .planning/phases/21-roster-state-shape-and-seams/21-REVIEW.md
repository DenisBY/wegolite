---
phase: 21-roster-state-shape-and-seams
reviewed: 2026-11-26T09:00:00Z
depth: standard
diff_base: 7ba0a4c051a91fbd65d95eb0566c908a404b444d
files_reviewed: 68
files_reviewed_list:
  - src/app/npc-models.ts
  - src/app/probe.ts
  - src/app/session/event-router.ts
  - src/app/session/probe-publisher.ts
  - src/app/session/render-driver.ts
  - src/app/session/start-session.ts
  - src/app/session/step-options.ts
  - src/app/session/traffic.ts
  - src/content/schemas/auto-ai-map.ts
  - src/content/schemas/comms.ts
  - src/content/schemas/role-categories.ts
  - src/content/schemas/ship-hull.ts
  - src/content/schemas/ship-npc.ts
  - src/content/ships-hulls.ts
  - src/render/bodies/explosions.ts
  - src/sim/ai/priority.ts
  - src/sim/ai/registry.ts
  - src/sim/ai/test-spawn.ts
  - src/sim/ai/types.ts
  - src/sim/combat/aim.ts
  - src/sim/combat/death.ts
  - src/sim/combat/ledger.ts
  - src/sim/combat/state.ts
  - src/sim/combat/step.ts
  - src/sim/economy/market.ts
  - src/sim/events.ts
  - src/sim/npc/behaviours/attack.ts
  - src/sim/npc/fire.ts
  - src/sim/npc/stats.ts
  - src/sim/rng.ts
  - src/sim/world/control-impl.ts
  - src/sim/world/control.ts
  - src/sim/world/debris.ts
  - src/sim/world/drift.ts
  - src/sim/world/entity.ts
  - src/sim/world/kill.ts
  - src/sim/world/limits.ts
  - src/sim/world/populate.ts
  - src/sim/world/retire.ts
  - src/sim/world/sanitize.ts
  - src/sim/world/serialize.ts
  - src/sim/world/snapshot.ts
  - src/sim/world/view-impl.ts
  - src/sim/world/view.ts
  - src/sim/world/world.ts
  - tools/oolite-ingest/convert/atlas.test.ts
  - tools/oolite-ingest/convert/atlas.ts
  - tools/oolite-ingest/convert/auto-ai-map.test.ts
  - tools/oolite-ingest/convert/auto-ai-map.ts
  - tools/oolite-ingest/convert/comms.test.ts
  - tools/oolite-ingest/convert/comms.ts
  - tools/oolite-ingest/convert/dat.ts
  - tools/oolite-ingest/convert/glb.test.ts
  - tools/oolite-ingest/convert/glb.ts
  - tools/oolite-ingest/convert/npc-ships.test.ts
  - tools/oolite-ingest/convert/npc-ships.ts
  - tools/oolite-ingest/convert/role-categories.test.ts
  - tools/oolite-ingest/convert/role-categories.ts
  - tools/oolite-ingest/convert/ship-hulls.test.ts
  - tools/oolite-ingest/convert/ship-hulls.ts
  - tools/oolite-ingest/convert/ship-mass.test.ts
  - tools/oolite-ingest/convert/ship-radius.test.ts
  - tools/oolite-ingest/convert/ships.test.ts
  - tools/oolite-ingest/convert/texture-encode.test.ts
  - tools/oolite-ingest/convert/texture-encode.ts
  - tools/oolite-ingest/convert/textures.test.ts
  - tools/oolite-ingest/convert/textures.ts
  - tools/oolite-ingest/generate.ts
findings:
  critical: 0
  warning: 8
  info: 6
  total: 14
necessity: 0
status: issues_found
---
# Phase 21: Code Review Report

Three independent reviewers (Opus subagents, standard depth) each reviewed one area of the phase-21 diff (`7ba0a4c0..HEAD`). The orchestrator merged their reports below unchanged, except that each finding ID is prefixed with its area (SIM, APP, TOOLS).

| Area | Files | Critical | Warning | Info |
| ---- | ----- | -------- | ------- | ---- |
| A: simulation | 30 | 0 | 3 | 0 |
| B: app, content, render | 15 | 0 | 2 | 3 |
| C: content build pipeline | 23 | 0 | 3 | 3 |

## Part A: simulation (src/sim)

**Reviewed:** 2026-11-26
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

### Summary

I reviewed the phase-21 diff (`git diff 7ba0a4c0..HEAD`) of the 30 simulation files: the v5 entity fields and world records (spawn domain, sanitiser, hash and snapshot), the debris changes (D-01 velocity base, pod contents from the stateless `pod` fork, survivors' draws hoisted before the spawns), the per-facing fire queue and gate, the ledger's hit-reaction stage, `retireShip`, the standing seam and the inert priority-AI shape.

What I checked and found sound:
- `src/sim/` stays pure. I found no `Math.random`, `Date`, DOM or Three.js use. The `content/types` import in `debris.ts` is type-only.
- The pristine-omit hash segments (`bty`, `role`, `grp`, `ck`, `pod`, `fuel`, `inj`, `sys`, `wpf`, `wty`, `fine`, and the `groups:`, `repop:`, `station:` and `|std:` lines) agree with the spawn defaults. Pristine values print nothing, and every string is quoted through `encodeHashString`.
- The spawn domain, the sanitiser, the snapshot parser and the limits agree for every v5 entity leaf.
- The new sanitisers return a value on every malformed shape I traced, including non-objects, wrong leaf types and arrays.
- Hoisting the 13 draws of each surviving pod ahead of the spawns leaves the draw order unchanged, because no draw depends on a spawn.
- I checked these against the Oolite source: D-01 (pods, plates and wrecks inherit `[self velocity]`, and `becomeExplosion` does not zero the speed first), `onTarget:` per facing, `getContainersOfGoods` and `getRandomAmountOfCommodity`.

The three findings below are latent: nothing in ordinary play reaches them yet. Each one breaks an invariant the moment its Phase 22 or 23 consumer arrives. SIM-WR-02 was reproduced in Docker with a scratch probe (`docker compose run --rm -v <scratch>:/scratch test npx tsx /scratch/probe.ts`). The probe lives outside the repository.

The necessity category was assessed and gave no findings. The inert seams (the `priority` AI, `retireShip`, `HitReaction`, `StandingView`, the unused RNG purposes) are owner-scheduled seams, each with a named consumer phase and a guard. They are not generality without instantiation.

### Narrative Findings (AI reviewer)

### Warnings

#### SIM-WR-01: A weapon override of `EQ_WEAPON_NONE` skips the fire gate and its draw, unlike an authored `EQ_WEAPON_NONE`

**File:** `src/sim/combat/step.ts:380-390` (called from `:317`; the draw is at `:325`)
**Issue:** `resolveNpcWeapon` returns `undefined` when `entity.weaponTypes[facing]` is `EQ_WEAPON_NONE` or an unknown key. `drainFireQueue` then continues before it creates the combat stream, so the gate takes no `randf()` draw. A record whose forward weapon is authored `EQ_WEAPON_NONE` takes the opposite path. `npcWeaponsOf` (`src/app/session/traffic.ts:190-222`) keeps that forward entry on purpose "so the fire gate still takes its one draw and refuses". `npcFireGate` then draws at `src/sim/npc/fire.ts:263` and refuses with `noWeapon` at `:275`.

The two kinds of unarmed ship therefore advance `shooter.rng.combat` differently. That stream also drives the ship's debris on death (placement, survival, wrecks, plates), so the debris diverges as well.

The justification in the doc comment, "Oolite refuses a facing it has no weapon for before `fireWeapon:`" (`:378`), is wrong. `fireMainWeapon:`, `fireAftWeapon:`, `firePortWeapon:` and `fireStarboardWeapon:` (`ShipEntity.m:10009-10073`) all call `fireWeapon:direction:range:` unconditionally. With `EQ_WEAPON_NONE`, that function passes heat, energy and the timer, then takes the `randf()` at `:9949` before `isWeaponNone` stops the shot.

**Failure scenario:** Phase 22 ports `_setWeapons` (`oolite-populator.js:2217-2272`), which can strip a forward laser to `EQ_WEAPON_NONE` as an override. Phase 23's attack behaviour then calls `ctx.fire` every tick for that ship. In Oolite the ship draws once per eligible tick. In Wegolite it never draws, so its later debris differs from an otherwise identical record that authors `EQ_WEAPON_NONE`. No FIDELITY row records this.
**Fix:** Route an override of `EQ_WEAPON_NONE` through the gate, as the authored `EQ_WEAPON_NONE` is routed:
```ts
if (override === null) return authored;
if (override === NO_LASER) return { laser: NO_LASER, offset: authored?.offset ?? ORIGIN };
if (!isMountKey(override)) return undefined; // a corrupt key: no Oolite equivalent
return { laser: override, offset: authored?.offset ?? ORIGIN };
```
Then correct the doc comment at `:371-379`. If skipping the draw is intended, add a FIDELITY row and a test that pins authored `EQ_WEAPON_NONE` against override `EQ_WEAPON_NONE`.

#### SIM-WR-02: The v5 world records are repaired only as a side effect of `hashWorld`, so `snapshotWorld` can write a snapshot that `parseWorldSnapshot` refuses

**File:** `src/sim/world/snapshot.ts:661-750`, `src/sim/world/serialize.ts:383-385`, `src/sim/world/step.ts:290-300`, `src/sim/world/sanitize.ts:1146-1172`
**Issue:** `parseWorldSnapshot` enforces the record invariants:
- `station.marks` strictly ascending and unique;
- `station.launched` from 0 to 255 (`MAX_STATION_LAUNCHED`);
- `groups` ascending by unique id, every id and leader at least 101.

`snapshotWorld` enforces none of them. It only calls `requireFinite`, then copies the records as they stand. The only code that sorts, de-duplicates or bounds them is `sanitizeStation`, `sanitizeGroups` and `sanitizePopulator`. Only `hashWorld` calls those, and the tick's `repairWorldFields` deliberately does not (SUMMARY 21-06).

The result depends on order:
- A world snapshotted before any hash call can produce JSON that cannot be read back.
- The same world snapshotted after a `hashWorld` call round-trips.
- A `launched` counter that passes 255 is silently reset to its pristine 0 by the next hash, which looks like a read. It is not clamped, and a `station:` line can vanish from the hash.

Reproduced in Docker: `w.groups.push({id:105,leader:105},{id:102,leader:102}); w.station.marks.push(140,120); w.station.launched = 300`. `parseWorldSnapshot(JSON.parse(JSON.stringify(snapshotWorld(w))))` throws `(range): snapshot.station.launched: expected an integer in 0..255`. After `sanitizeGroups` and `sanitizeStation`, the same world round-trips: the groups are re-sorted, the marks become `[120,140]` and `launched` becomes 0.

**Failure scenario:** Phase 22's populator appends a group whose founding leader has a lower id than an existing group's (escorts spawned before a later leader, or after a retire). Or Phase 25 appends a station mark out of order, or counts more than 255 launches. A save or snapshot taken on a tick boundary, before the probe or detector hash call, is then unreadable. With the counter case, the hashed state changes on the next hash.
**Fix:** Add `sanitizeStation`, `sanitizeGroups` and `sanitizePopulator` to `repairWorldFields` in `src/sim/world/step.ts`, which already does the same for static health and buoys. That makes the records valid at every tick boundary, independent of hashing. Also give the writers a sorted-insert helper (for example `addGroup` or `markOffender` in `world.ts`) and saturate `launched` at `MAX_STATION_LAUNCHED` instead of resetting it, so that a repair never erases real state. As defence in depth, `snapshotWorld` could refuse an out-of-invariant record with a `SnapshotError` rather than emit it.

#### SIM-WR-03: The `medical` cargo kind fills every pod with narcotics, but at the pin Oolite releases no pods for it, and no FIDELITY row records the divergence

**File:** `src/sim/world/debris.ts:602`, `:763`, `:793-797`
**Issue:** `drawPodContents` turns `CARGO_FLAG_FULL_MEDICAL` into "every pod is `narcotics`". This follows `setCargoFlag:` (`ShipEntity.m:7356`, `getContainersOfCommodity:@"Narcotics"`). At the pin, Oolite's commodity dictionary is the raw `trade-goods.plist` with lower-case keys (`OOCommodities.m:103,117`; `"narcotics" = {` at `trade-goods.plist:116`). `getContainersOfCommodity:` starts with `if (![commodities goodDefined:commodity_name]) return [NSArray array];` (`Universe.m:3940-3945`). `goodDefined:` is an exact `NSDictionary` key lookup (`OOCommodities.m:349-352`), so `@"Narcotics"` is never defined, and a medical ship's cargo array is empty. On death, `releaseCargoPodsDebris` (`ShipEntity.m:7820-7831`) loops over that empty array and releases no commodity pods.

Wegolite instead releases `victim.cargo` pods, all of them narcotics. This may well be the better behaviour (it fixes an upstream bug). The fidelity rule still requires a recorded divergence. FIDELITY.md rows 111-112 name plentiful, scarce, contraband and pirate only, and nothing mentions medical or narcotics.
**Failure scenario:** Phase 22 ports the populator's `$medicalReg` branch (`oolite-populator.js:1410-1413`, `goods = "MEDICAL_GOODS"`) and sets `cargoKind` 3. Every destroyed medical ship then drops scoopable narcotics pods, which a player can sell. Oolite drops none.
**Fix:** Pick one of two:
- Port Oolite as it stands: a medical kind yields no contents and, to match, no pods. The pod count belongs to the caller.
- Keep the narcotics fill: add a FIDELITY row that cites `ShipEntity.m:7356` and `OOCommodities.m:349-352` and names the upstream case-mismatch bug as the reason, with reviewer agreement as the fidelity rule requires.

Either way, add a test that pins the chosen medical outcome.

---

_Reviewed: 2026-11-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Part B: app, content, render (src/app, src/content, src/render)

**Reviewed:** 2026-11-26
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

### Summary

Scope: the phase-21 diff (`git diff 7ba0a4c0..HEAD`) of the 15 listed files. I also read the code they call: `AssetCache.loadNpcModel` and `dispose`, `spawnTestAnarchy` and `spawnEntity` in `src/sim`, `firstGenerationMarket`, the `shipDestroyed` and player-death event types, Oolite's `OOExplosionCloudEntity.m` and `OOParticleSystem.m`, and the Node-replay content builder in `tests/helpers/tick-script.ts`.

I found no blocker. These parts check out:

- **Prefetch loader (`npc-models.ts`).** The concurrency counter is released on success, on rejection and on a synchronous throw. A key that `request` has already started is skipped by `pump`. After `dispose()`, `pump` starts nothing, the queue is cleared and late resolutions are dropped, so no slot leaks and no load runs twice. I found no race between `prefetch`, `request`, `open` and `dispose`. `AssetCache` still owns and disposes every GLTF the prefetch loads.
- **Render driver.** The prefetch starts once, on the first docked frame that has traffic content. With traffic off the catalogue is absent, so it never starts. The simulation never reads it.
- **Pod market.** The browser (`start-session.ts:317`) and the Node replay (`tick-script.ts:215`) both pass `commodities`, so they derive the same market. System ids are unique across galaxies (`"g0-s0"`), so the cache key does not collide.
- **Explosion drift.** The factors match Oolite: cloud 1x capped at 1000 m/s (`OOExplosionCloudEntity.m:62,102-105`), small burst 1x, big burst 0.85x (`OOParticleSystem.m:274,324`), flash 1x. The cap applies only to a cloud with no `kind`. Each `add` overwrites both velocity arrays, so a reused slot cannot keep an old drift. The layer copies the velocity from the event and keeps no reference to it.
- **Hull aliases.** I checked the committed JSON: all 29 NPC keys resolve to a hull entry or alias. Every alias group shares one model file and one collision radius.
- **Test hooks.** `spawnTestAnarchy` is reachable only through `window.__wegolite.test`. That object is bound only when the URL has exactly `?test=1` (`test-flags.ts:34`, `start-session.ts:510,863`). The hook taints the session before it changes the world, and it is all-or-nothing: every refusal in `spawnEntity` that depends on world state (id exhaustion, store full) is checked before the first real spawn.

On whether the test hooks can be reached in production: they can. Both `spawnTestAnarchy` and the probe ship in the production bundle and work under `?test=1`. This is the recorded design, not a new defect: PROJECT.md Key Decisions, the CBT-15 row (owner-accepted 2026-11-19: "the test seam does ship in the production bundle, gated at runtime by the `?test=1` flag and tainting the session"), and T-21-30 in 21-16-PLAN. Without `?test=1` no hook member exists. If the orchestrator wants the hooks stripped from the production bundle, that needs a build-flag decision, not a code fix here.

### Warnings

#### APP-WR-01: The DATA-13 comments still say a cold start fetches no NPC model before the first in-flight frame; the D-07 prefetch now does

**File:** `src/app/npc-models.ts:16-26`, `src/app/game-session.ts:355-361`
**Issue:** The loader header says: "A cold start thus requests no NPC model and, because textures are fetched only by the GLB loads, no NPC texture either, before that frame." `game-session.ts` says the models are "loaded per ship key and only once the render driver opens the loader after the first in-flight frame". Both statements stopped being true in plan 21-11. `render-driver.ts:263-269` now calls `npcModels.prefetch(...)` on the first docked frame. In a traffic-on cold start (the production default), that frame comes before the first in-flight frame, so all 29 GLBs and about 127 textures (33,046,391 B, per 21-17) start downloading before launch. The new paragraph at `npc-models.ts:33-44` describes the prefetch, but the old invariant above it was left unqualified. The same is true of PROJECT.md row 282, "Defer NPC model requests until the first in-flight frame". The D-07 row (line 371) records the new behaviour but does not mark row 282 as amended.

Failure scenario: a later plan, such as a per-system prefetch or an offline/metered-network mode, or a reviewer of the first-load ceiling, reads these comments as the cold-start contract and assumes the NPC set is never fetched before launch. The budget measurement already depends on excluding that set by path (21-11), so the comments now point the other way from the code.
**Fix:** Reword the latch paragraph to say that the latch governs only `request`, and that `prefetch` (D-07) downloads the catalogue hulls from the first docked frame, outside the first-load ceiling by exclusion. Update the `game-session.ts` comment the same way, and add "amended by D-07 (plan 21-11)" to PROJECT.md row 282.

#### APP-WR-02: `escortRoles` is the only new list in the phase's schemas with no bound, and its `role` string has no length limit

**File:** `src/content/schemas/ship-npc.ts:199-207`
**Issue:** The three new schemas bound every list and string (their headers say "every list and string is bounded"), and `ShipHullSchema` gained `.max(MAX_HULL_ALIASES)`. The new `escortRoles` field is `z.array(z.strictObject({ min, max, role: z.string() })).nullable()`: it has no `.max(...)` on the array and none on `role`. The NPC catalogue is loaded at runtime as a lazy `?raw` chunk and validated with this schema (`src/content/ships-npc.ts:48`). The schema is the only bound before Phases 22 and 23 iterate the list to spawn escorts. Oolite stops at `MAX_ESCORTS` (16) inside the loop (`ShipEntity.m:1651-1653`), so it never needs a bounded list. A Wegolite consumer that trusts the validated record has no such guarantee.

Failure scenario: a converter regression, or a hand-edited generated file that `assets:check` does not catch before a local run, yields an `escortRoles` list with thousands of entries or a multi-megabyte role name. The schema accepts it, and the Phase 22 populator iterates or matches it per spawn.
**Fix:**
```ts
export const MAX_ESCORT_ROLE_ENTRIES = 16; // MAX_ESCORTS, ShipEntity.m:680
escortRoles: z
  .array(
    z.strictObject({
      min: z.number().int().min(-128).max(127),
      max: z.number().int().min(-128).max(127),
      // "" is authored (the Boa); otherwise a role token.
      role: z.string().max(64).regex(/^(?:[A-Za-z0-9][A-Za-z0-9_-]*\+?)?$/),
    }),
  )
  .max(MAX_ESCORT_ROLE_ENTRIES)
  .nullable(),
```
Before choosing the bound, check the stock maximum in `shipdata.plist`. If authored lists can be longer than 16 (Oolite reads them and then stops), use the larger value and document it.

### Info

#### APP-IN-01: The `spawnTestAnarchy` doc says a refusal "changes nothing", but a room or empty-catalogue refusal leaves the session tainted

**File:** `src/app/probe.ts:390-397`, `src/app/session/probe-publisher.ts:295-318`
**Issue:** `spawnAnarchy` calls `markHookMutation()` (line 316), which sets `ctx.runtime.testTainted`, before the sim spawner runs. When the spawner refuses because the world has no room, or because `traffic.records` yields no valid ship, the call returns false and the session stays tainted. The interface doc says "otherwise it returns false and changes nothing ... with no room ... it spawns none and returns false", without mentioning the taint. The `spawnFlyers` doc does state this case. The behaviour is the safe direction (over-tainting), but the contract text is wrong for that path. A spec that asserts an untainted session after a refused anarchy call would fail.
**Fix:** Add one sentence to both docs: "If the sim spawner refuses (no room, no valid record), nothing is spawned, but the session stays tainted."

#### APP-IN-02: The pod-market cache is keyed by `system.id` alone, while the market also depends on `system.economy`

**File:** `src/app/session/step-options.ts:133-168`
**Issue:** `debrisWithMarket` stores the derived content in a module-level `WeakMap<DebrisContent, Map<id, DebrisContent>>` and looks it up by `system.id` (line 155). `firstGenerationMarket(system, goods)` reads `system.economy` too. In shipped content, id determines economy, so this is correct today. The cache is module-global, though, so it lives for the whole Vitest worker. A test that reuses one frozen `DebrisContent` with a synthetic system (same id, different economy) silently gets the first market.
**Fix:** Key the cache by `` `${system.id}:${system.economy}` ``, or document the id-to-economy invariant at the cache.

#### APP-IN-03: The `ships-hulls.ts` header still says "Nothing imports this module yet"

**File:** `src/content/ships-hulls.ts:11-12`
**Issue:** The phase edited lines 7-8 of this header but kept "Nothing imports this module yet; the session start-up that wires the load ... is a later plan of Phase 13". `start-session.ts:35` imports `loadShipHulls`, and the catalogue now carries the alias registration that `hullTable` relies on.
**Fix:** Replace the sentence with "Loaded by `start-session.ts` (traffic on only) and built into the hull table by `hullTable`, with aliases."

---

_Reviewed: 2026-11-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Part C: content build pipeline (tools/)

**Reviewed:** 2026-11-26T08:00:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

### Summary

I read the phase-21 diff (`git diff 7ba0a4c0..HEAD`) of the 23 files under `tools/`. Most of the time went to the per-hull atlas merge (`atlas.ts`), its GLB wiring (`glb.ts`, `generate.ts`), the texture emitters, and the three plist compilers.

**Atlas: what I checked and found correct**

- **UV remap.** The remap `(region.x + u·side) / atlasSide` uses an integer upscale ratio that is a power of two. With such a ratio, `floor(floor(u·side) / ratio)` equals `floor(u·width)` exactly, so the painted texel and the source texel agree.
- **`u = 1` corner.** At `u = 1`, the clamp sends the corner to the region's last texel on both sides.
- **`settleCoordinate`.** It steps the bit pattern up or down by one and handles 0 correctly.
- **`packHullAtlas`.** The packing is deterministic: a stable sort, ties broken by index, and alignment to multiples of each region's own side. Its loop bound (`sum`) always terminates, because a row of the regions always fits.
- **RGB inputs.** RGB inputs decode to opaque RGBA through `decodeColourPng`. The emission slot reads the source alpha, the same rule as the per-map bake (`grey = alpha`); every vendored `extract_channel` is `"a"`.
- **File names.** Content-addressed names hash only the side, the channel count and the pixels. `atlasImagesOf` sorts by name. The `texture-encodings.json` rows are sorted by path.
- **WebP round trip.** I decoded the committed roughness atlases in the container's Chromium (anaconda, python, cobra3, mamba). The `-near_lossless 60` profile left every region constant exact: the histogram counts equal the region areas exactly, for example anaconda `{10: 1310720, 96: 262144, 255: 786432}`.

**Plist compilers.** The auto-AI map and role-categories compilers are sound. The comms closure is sound as a closure, but it misclassifies Oolite's digit keys (TOOLS-WR-03).

No blocker was found. The three warnings are:

1. A visible sampling regression that the module doc's "no gutter" argument misses at mip levels above 0.
2. Shared parsed meshes that are now repaired twice, which is safe today only by luck of the data.
3. The `[7]` digit key in the comms subset, recorded as a runtime variable.

### Narrative Findings (AI reviewer)

### Warnings

#### TOOLS-WR-01: No-gutter atlas bleeds the neutral fill and neighbouring regions into the hull edges at mip levels above 0

**File:** `tools/oolite-ingest/convert/atlas.ts:33-38`, `:278-281`, `:519-525`
**Issue:** The module doc argues that no gutter is needed. Its reason: a bilinear fetch across a region edge reads only "the half-texel" that the source map's own REPEAT wrap used to read. That holds only at mip level 0. At mip level k, a bilinear fetch at a region edge reads `2^(k-1)` base texels of whatever lies across the edge.

The writer emits no sampler, so the glTF default wrap is REPEAT and three.js uses trilinear mipmaps. Across the edge there is now one of two things:

- the unused atlas area, filled with a constant: diffuse white `255`, roughness `G = 255` (fully rough), normal `128,128,255`;
- another region, through REPEAT across the atlas edge.

Before the merge, the hull map's edge blended with its own opposite edge.

Concrete case, anaconda (`packHullAtlas([1024, 512, 512])`, side 1536, regions `(0,0,1024)`, `(1024,0,512)`, `(1024,512,512)`):

- The hull region's bottom edge (`y = 1023`) touches the unused white block at `y >= 1024`.
- Its top edge wraps to row 1535, which is also white fill.
- Its left edge wraps to `x = 1535`, which holds the subentity regions.

The hull UVs really reach those edges. A scratch probe over `oolite_anaconda.dat` gave Hull `minV 0.0006`, `maxV 0.99869`, `minU 0.00114`, with 252 of 3,522 corners within 8 texels of the map edge. Cobra Mk III and Python show the same pattern. At distance, the seams along those UV islands lighten toward white, and roughness moves toward 1.

The texel-exactness check (e) samples only nearest level-0 texels at corners, so it cannot catch this.

**Fix:** Do not leave the unused area or a region's border neutral. Two options:

- Extrude each region's edge texels into the free space around it (edge padding). This costs no atlas area where space is free.
- Reserve a gutter of `2^(maxLevel-1)` texels and cap `maxLevel` per hull in the material, for example through `extras` read by the client.

At minimum, correct the module doc so it states that the bleed grows with the mip level. Record the visual divergence in `FIDELITY.md` if it is accepted.

#### TOOLS-WR-02: `planHullMerges` repairs the shared parsed meshes in place, so `emitModels` repairs a legacy hull a second time

**File:** `tools/oolite-ingest/convert/glb.ts:1567-1586` (`planHullMerges` -> `buildNodeMesh` -> `prepareMesh`, `:1255-1262`), `tools/oolite-ingest/generate.ts:259-265`
**Issue:** `prepareMesh` calls `repairWinding(mesh, mode)`, which swaps face corners and UVs in place on the `ParsedMesh` from the shared `models` record (`dat.ts:590-630`). The repair is not idempotent. Take a face whose stored normal disagrees with the computed one on some components but agrees on others. After one swap, the computed normal flips sign, so the face fails the test again on the other components and is swapped back.

The code comment at `glb.ts:1256-1258` states the invariant: "running it twice would double-flip a repaired face".

`generate.ts` now does two things in sequence:

1. `planHullMerges(models, ...)` builds every NPC hull, the single-primitive ones included.
2. `emitModels(models, entries, merges)` calls `buildShipGlb` -> `buildNodeMesh` again for every `single` and `refused` outcome, on the same mutated mesh.

`oolite_krait.dat` has no `NORMALS` block, so it is in a legacy mode and goes through both passes. I ran a scratch probe in the test container: the Krait, the buoy, the Coriolis and wreck1/2 swap 0 faces on the first pass. Today's bytes are therefore unchanged, which matches the SUMMARY's "krait identical". The next legacy NPC hull with one mixed-sign face will be emitted with its winding and UVs silently reversed, and no gate will notice.

`atlas.test.ts:761-765` repeats the same pattern: a `structuredClone` of a mesh that `planAll` has already repaired, then a second `repairWinding`. The test would therefore agree with a double-flipped build.

**Fix:** Do not mutate the shared input. In `buildNodeMesh`, work on `structuredClone(mesh)`, or memoise the converted primitives per source file so the repair runs exactly once per mesh. Add a guard test that builds a legacy fixture twice through `planHullMerges` + `emitModels`, with one mixed-sign face, and asserts the emitted winding.

#### TOOLS-WR-03: The comms subset records the digit key `[7]` as a runtime variable, but Oolite expands it from `system_description[7]`

**File:** `tools/oolite-ingest/convert/comms.ts:11-14`, `:125-134`
**Issue:** The closure treats every bracket token that is not a key of `descriptions.plist` as a "runtime variable ... never followed", and the doc names `[7]` as an example. In Oolite, a key made only of digits is not a variable. `ExpandKey` dispatches it to `ExpandDigitKey` (`/home/opencode/git/oolite/src/Core/OOStringExpander.m:342-393`, `:503-555`), which selects a random string from `system_description[7]`: "beset", "plagued", "ravaged", "cursed", "scourged" (`descriptions.plist:244-250`). For a five-item row, the selection uses the Elite-compatible thresholds.

The compiled `comms.json` lists `[7]` under `variables` beside `[oolite_entityName]`. Phase 23 is told to treat everything in `variables` as a substitution parameter. With that contract, "We are [7] by [describe-pirate]s! Please help!" (`distress-call`) has no source for `[7]`: it renders literally or blank, a silent divergence in the first consumer. The data does exist, as `labels.json` `systemDescription`, but nothing in the comms contract points there.

**Fix:** Classify digit-only tokens separately, for example as a `digitKeys: [7]` member or by resolving them into the closure as `system_description.7` with its row. Document that they index `systemDescription`. Update the converter test that asserts the variable set, and the 21-10 SUMMARY hand-off text.

### Info

#### TOOLS-IN-01: The merge ignores `primitive.indices` and writes an identity index buffer

**File:** `tools/oolite-ingest/convert/atlas.ts:585`, `:616`
**Issue:** `indices[cursor + corner] = cursor + corner` assumes that every source primitive's index buffer is `0..n-1`. That is true of today's `convertMesh`, which does no deduplication (`glb.ts:29-31`). Nothing asserts it, though. A future deduplicated or reordered primitive would be merged into wrong triangles, and the exactness check would still pass, because it iterates vertices, not triangles.
**Fix:** Write `indices[out++] = primitive.indices[i] + cursor` for each source index, or assert identity indices up front and refuse otherwise.

#### TOOLS-IN-02: Unreachable `continue` branches would misalign the cursor if ever taken

**File:** `tools/oolite-ingest/convert/atlas.ts:529`, `:589`, `:626`
**Issue:** `if (region === undefined) continue;` (and the tuple variant) skips `cursor += count`. All later primitives would then be written at, and checked against, the wrong vertex offsets. The branches cannot be taken (`tupleOf` and `layout.regions` are index-aligned by construction), so they only hide an invariant break.
**Fix:** Throw instead of `continue`, so a broken invariant fails the build.

#### TOOLS-IN-03: `atlasImagesOf` keeps the last image per name and drops differing provenance silently

**File:** `tools/oolite-ingest/convert/glb.ts:1589-1600`
**Issue:** Images are keyed by their content-addressed name and overwritten. Two variants could produce pixel-identical atlases from different vendored files. The surviving `inputTextures` would then name only one of them, and the `texture-encodings.json` `inputs` and the `ASSETS.md` provenance would be incomplete. The current inputs have no byte-identical files (`CHECKSUMS.sha256` has no duplicate hash), so the case does not occur today.
**Fix:** On a name collision, merge the `inputTextures` and `inputConfig` sets, or assert that they are equal.

---

_Reviewed: 2026-11-26T08:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
