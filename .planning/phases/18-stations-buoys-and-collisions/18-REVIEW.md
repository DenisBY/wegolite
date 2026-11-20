---
phase: 18-stations-buoys-and-collisions
reviewed: 2026-11-20T17:36:17Z
depth: standard
files_reviewed: 154
files_reviewed_list:
  - AGENTS.md
  - CHANGELOG.md
  - FIDELITY.md
  - NOTICE
  - README.md
  - docs/PERFORMANCE.md
  - src/app/hud-model.ts
  - src/app/session/context.ts
  - src/app/session/event-router.ts
  - src/app/session/hyperspace-controller.ts
  - src/app/session/probe-publisher.ts
  - src/app/session/render-driver.ts
  - src/app/session/start-session.ts
  - src/app/session/step-options.ts
  - src/app/session/traffic.ts
  - src/content/generated/manifest.json
  - src/content/generated/ships-static-hulls.json
  - src/content/schemas/ship-hull.ts
  - src/content/schemas/ship-static-hull.ts
  - src/content/ships-static-hulls.ts
  - src/render/bodies/buoy.ts
  - src/render/hud/format.ts
  - src/render/sync.ts
  - src/sim/combat/collide.ts
  - src/sim/combat/constants.ts
  - src/sim/combat/hit.ts
  - src/sim/combat/ident.ts
  - src/sim/combat/ledger.ts
  - src/sim/combat/octree.ts
  - src/sim/combat/response.ts
  - src/sim/combat/shields.ts
  - src/sim/combat/step.ts
  - src/sim/dock/computer.ts
  - src/sim/dock/step.ts
  - src/sim/flight/config.ts
  - src/sim/flight/drift.ts
  - src/sim/flight/launch.ts
  - src/sim/flight/sanitize.ts
  - src/sim/flight/state.ts
  - src/sim/flight/step.ts
  - src/sim/hyperspace/arrival.ts
  - src/sim/hyperspace/countdown.ts
  - src/sim/npc/collision-chain.ts
  - src/sim/npc/flight.ts
  - src/sim/npc/proximity.ts
  - src/sim/sim.ts
  - src/sim/world/aegis.ts
  - src/sim/world/debris.ts
  - src/sim/world/drift.ts
  - src/sim/world/entity.ts
  - src/sim/world/ids.ts
  - src/sim/world/kill.ts
  - src/sim/world/limits.ts
  - src/sim/world/sanitize.ts
  - src/sim/world/serialize.ts
  - src/sim/world/ship-field.ts
  - src/sim/world/snapshot.ts
  - src/sim/world/sorted-lists.ts
  - src/sim/world/statics.ts
  - src/sim/world/step.ts
  - src/sim/world/view-impl.ts
  - src/sim/world/world.ts
  - tests/app/session/event-router-ident.test.ts
  - tests/app/session/hyperspace-controller.test.ts
  - tests/app/session/probe-publisher.test.ts
  - tests/app/session/render-driver.test.ts
  - tests/app/session/sim-driver.test.ts
  - tests/app/session/start-session.test.ts
  - tests/app/session/tick-parity.test.ts
  - tests/app/session/traffic.test.ts
  - tests/app/session/world-lifecycle.test.ts
  - tests/content/player-ship.test.ts
  - tests/content/ships-static-hulls.test.ts
  - tests/e2e/combat.spec.ts
  - tests/e2e/hyperspace-failure.spec.ts
  - tests/e2e/statics.spec.ts
  - tests/golden/content/ships-static-hulls.json
  - tests/guards/collision-chain-scope.test.ts
  - tests/guards/collision-player-death.test.ts
  - tests/guards/hud-message-length.test.ts
  - tests/helpers/hull-table.ts
  - tests/helpers/tick-script.ts
  - tests/oracles/combat/geometry/dat.ts
  - tests/oracles/combat/geometry/derive.ts
  - tests/oracles/combat/geometry/fixtures/dock-mouth.json
  - tests/oracles/combat/geometry/fixtures/octree-collide.json
  - tests/oracles/combat/geometry/geometry.self.test.ts
  - tests/oracles/combat/geometry/octree-collide.ts
  - tests/oracles/combat/geometry/ray-mesh.ts
  - tests/oracles/combat/geometry/schema.ts
  - tests/oracles/combat/response/fixtures/blast.json
  - tests/oracles/combat/response/fixtures/braking-npc.json
  - tests/oracles/combat/response/fixtures/braking-player.json
  - tests/oracles/combat/response/fixtures/collide.json
  - tests/oracles/combat/response/fixtures/scrape.json
  - tests/oracles/combat/response/reference.ts
  - tests/oracles/combat/response/response.self.test.ts
  - tests/oracles/combat/response/schema.ts
  - tests/persistence/restore-drift.test.ts
  - tests/render/buoy.test.ts
  - tests/render/sync.test.ts
  - tests/sim/aegis.test.ts
  - tests/sim/combat/collide.property.test.ts
  - tests/sim/combat/collide.test.ts
  - tests/sim/combat/collision-buoy.test.ts
  - tests/sim/combat/collision-cost.test.ts
  - tests/sim/combat/collision-prime.oolite.test.ts
  - tests/sim/combat/collision-stage.property.test.ts
  - tests/sim/combat/collision-stage.test.ts
  - tests/sim/combat/collision-traffic.scenario.test.ts
  - tests/sim/combat/constants.test.ts
  - tests/sim/combat/dock-mouth.oracle.test.ts
  - tests/sim/combat/fixtures/buoy-contact-remeasure-2026-11-20.json
  - tests/sim/combat/hit.test.ts
  - tests/sim/combat/ident.test.ts
  - tests/sim/combat/kill.property.test.ts
  - tests/sim/combat/ledger.test.ts
  - tests/sim/combat/octree-collide.oracle.test.ts
  - tests/sim/combat/response.oracle.test.ts
  - tests/sim/combat/response.property.test.ts
  - tests/sim/combat/response.test.ts
  - tests/sim/combat/shields.test.ts
  - tests/sim/combat/step.test.ts
  - tests/sim/compass-beacon.test.ts
  - tests/sim/flight-drift.test.ts
  - tests/sim/hyperspace-arrival.test.ts
  - tests/sim/hyperspace-blockage.test.ts
  - tests/sim/npc/buoy-proximity.test.ts
  - tests/sim/npc/escort-refresh.test.ts
  - tests/sim/npc/fire-route.test.ts
  - tests/sim/npc/hot-weapon.test.ts
  - tests/sim/npc/proximity.test.ts
  - tests/sim/npc/step-integration.test.ts
  - tests/sim/player-braking.oracle.test.ts
  - tests/sim/world/blast.oracle.test.ts
  - tests/sim/world/buoy-clearance.test.ts
  - tests/sim/world/collision-cadence.test.ts
  - tests/sim/world/debris-cadence.test.ts
  - tests/sim/world/debris.test.ts
  - tests/sim/world/drift.test.ts
  - tests/sim/world/hash.test.ts
  - tests/sim/world/kill.test.ts
  - tests/sim/world/sanitize.test.ts
  - tests/sim/world/ship-braking.oracle.test.ts
  - tests/sim/world/ship-field.test.ts
  - tests/sim/world/snapshot-codec.test.ts
  - tests/sim/world/sorted-lists.test.ts
  - tests/sim/world/statics.test.ts
  - tests/sim/world/view.test.ts
  - tests/sim/world/world-cadence.test.ts
  - tests/ui/hud-model.test.ts
  - tools/oolite-ingest/convert/static-hulls.test.ts
  - tools/oolite-ingest/convert/static-hulls.ts
  - tools/oolite-ingest/generate.ts
findings:
  critical: 0
  warning: 2
  info: 15
  total: 17
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-11-20T17:36:17Z
**Depth:** standard
**Files Reviewed:** 154
**Status:** issues_found

## Summary

Scope: every non-planning file changed in 76229f5..HEAD (154 files, about 32.6k added lines). The file scope came from the plan SUMMARYs plus the phase evaluation scope, and it equals the git diff of the phase range. Because of its size, the review ran as four parallel gsd-code-reviewer lanes, each at standard depth against the Oolite checkout at /home/opencode/git/oolite. The orchestrator then merged the lanes and renumbered the findings; each finding notes its lane and original ID. Recorded FIDELITY.md divergences and the deferred todos under .planning/todos/pending/ were not re-reported.

Result: no critical findings; 2 warnings, both in the response test oracle (blast rounding and fixture circularity), with no current test failure; 15 info items, mostly comment and documentation drift, dead or unreachable code, and weak assertions.

**Lane 1 (collision core).** Lane 1 is the collision core: octree-against-octree contact (`octree.ts`, `collide.ts`), the `collideWithShip` kernel (`response.ts`), the combat-step collision stage and buoy plumbing (`step.ts`), and the NPC collision-chain prefilter and proximity pass.

I checked each ported routine line by line against the Oolite checkout and found no behavioural defect and no unrecorded divergence:

- `isHitByOctree` against `Octree.m:473-595`: the prunes, `change_oct`, the nearest-octant choice, the transposed child placement at `:552` and the empty and solid cases all match.
- `doOctreesCollide` against `ShipEntity.m:1878-1942`: the stage order, the `detached` handling and the claim that the C's stage 4 can never return are correct.
- `collideWithShip` against `ShipEntity.m:11020-11152`: the float rounding, the `selfDestroyed` and `otherDestroyed` flags, the reversal, the nudge and the subentity velocity handling match. The finiteness total check is sound.
- `filterSortedLists` against `Universe.m:6713-7144`: the upward walks, the head special case, the chain numbering, and the claim that the downward walks never run (the upward loop ends with `e0 = nil`) are all correct.
- Sweep prune: the `minX < maxX` break is sufficient. A pair with `xa - ra <= xb - rb` and `xb - rb < xa + ra` has overlapping x-intervals.
- Prime rule: the stage and the chain use one shared sort key (`compareOnAxis`).
- Chain scope: any pair whose spheres overlap is also in one z chain, so skipping the chain in the stage loses nothing.

Verification: `docker compose run --rm test` over `tests/sim/combat`, `tests/sim/npc/{buoy-proximity,proximity,step-integration}` and both guards gave 33 files and 638 tests, all green. `docker compose run --rm lint` (eslint and prettier) is clean.

The remaining findings are all Info: one production branch that real content cannot reach, one unreachable defensive fallback, two stale comments, and weak or noisy test assertions. The listed deferred todos (collision-chain all-pairs, player-death reversal, mutual-kill credit) are correctly scoped and guarded. Their deferrals are right, but one rationale quoted in source is stale (IN-04).

**Lane 2 (world, flight and persistence).** Reviewed the Phase 18 diff (`76229f5..HEAD`) of the world state, statics, kill/blast/debris, NPC/buoy/player drift and
braking, snapshot/sanitize/serialize persistence of the new state, and the flight/dock/hyperspace changes, with the Oolite
source as the reference. I did not run the Docker gates; this is a static review.

I found no critical issues and no warning-level defects. What I checked and could not break:

- **Save/snapshot/hash round trip of the new state.** `World.buoys` is written only when not pristine
  (`snapshotWorld`, `hashWorld`), the parser (`parseBuoys`/`parseBuoy`) bounds every field and agrees with
  `sanitizeBuoyStates` (taking-damage flag never set at energy 0, offsets at `MAX_BUOY_OFFSET`, velocity at
  `MAX_ENTITY_VELOCITY`), `-0` is normalised on all three paths, and `hashWorld` repairs before `canon` can throw.
  `FlightState.drift` is pristine-omitted in `serializeFlight`, zeroed on dock, launch, computer dock and arrival, and
  deliberately not saved (`restoreFromSave` starts from `initFlightState`; pinned by `restore-drift.test.ts`).
- **Drift and braking arithmetic against Oolite.** `brakeShipDrift` matches `ShipEntity.m:5808-5823` step for step
  (float32 rounding included, `if (thrust)` gate, `fmaxf`), and the order "steer, brake, move" matches Oolite's
  `applyThrust:` inside the behaviour step followed by `[super update:]` (`Entity.m:869`, `ShipEntity.m:2462`).
  `brakePlayerDrift` matches `PlayerEntity.m:3376-3404` (move first, then brake). Pods and plates correctly never brake:
  the `barrel` template has `thrust = 0` (`shipdata.plist:636`).
- **Blast.** `blastImpulse`/`blastFrom` follow `dealMomentumWithinDesiredRange:` (`ShipEntity.m:7680-7698`) including the
  receiver-radius range test, the 0.1 floor on `d2`, the zero vector for a coincident receiver (`vector_normal` of zero is
  zero, `OOVector.h:270-273`) and `isInSpace` for the player (includes the witchspace countdown, which maps to the
  in-flight mode). The blast sits outside Oolite's visibility/`add_debris` gate, as ported.
- **Compass/blockage.** The destroyed-beacon compass fallback matches `PlayerEntity.m:4655-4659`; the buoy mass rules,
  the hull-mass-after-subentity case and the checking order are documented and tested (`ship-field.test.ts`,
  `hyperspace-blockage.test.ts`).

The four items below are documentation or test-shape defects. None changes behaviour.

**Lane 3 (app, render, content, hit/ident/ledger/shields, docs).** Lane 3 covers the app session wiring, the render and HUD changes, the static-hull content pipeline, the hit, ident, ledger and shields changes, and the docs diffs.

I read the phase diff of every source file in scope against the Oolite sources. I verified:

- `ShipEntity.m:1323-1357`, the subentity hit loop, against `hit.ts`.
- `Universe.m:5648-5710` and `PlayerEntity.m:3595-3628`, ident acquisition and validity, against `ident.ts`.
- `PlayerEntity.m:5701-5753` and `ShipEntity.m:11636-11676`, scrape damage, against `routeScrapeDamage`.
- `ShipEntity.m:8185-8194` (`subEntityDied`) and `10190-10325` (the 1 % bleed-through) against the ledger and the buoy-subentity design.
- `StationEntity.m:1116-1156`, the station absorbing a hit.
- `ShipEntity.m:376` (`frangible` default) against the static-hull converter.
- `PlayerEntity.m:6545-6555` and `descriptions.plist:503`, the witch-blocked message.

I found no behavioural bug in the changed code and no unrecorded Oolite divergence that is not already covered by a FIDELITY row, a PROJECT.md decision or a pending todo. The pending todos cover the raw-key ident message with traffic off, the witch-blocked wording and the HUD word wrap.

Checks run in Docker:

- Typecheck: clean.
- Lint and prettier: clean.
- Vitest on 11 files of this lane: 260 passed, 1 skipped (the verbatim FIDELITY case, as designed). The files are the session, render, HUD, shields, static-hull content, `hud-message-length` guard and `fidelity` contract tests.

Other things I checked and found consistent:

- Generated-file bytes and sha256 against the manifest (205,542 bytes, `0360456d...`).
- The 53/54/55/44 message lengths quoted in the comments.
- The HUD geometry arithmetic behind `MAX_MESSAGE_CHARS = 60`: 964.5 + 567/2 = 1248, and 60 x 13.92 = 835.2.
- The `loadSessionContent` failure surface and dispose handling.
- The `hullTable` duplicate-key guard.

The only defects are documentation drift, below.

**Lane 4 (test oracles).** Lane 4 covers the geometry oracle (DAT reader, exact ray-mesh geometry, octree-against-octree transliteration, dock-mouth derivation), the response oracle (collideWithShip, drift braking, player scrape, blast), their strict fixture schemas, the self tests, and the one sim-side consumer in scope (`dock-mouth.oracle.test.ts`).

I compared every transliterated routine line by line with the Oolite source at `/home/opencode/git/oolite/src/Core` (the checkout is at 21978c3; `git diff 7437f22..HEAD` shows no change in `ShipEntity.m`, `Octree.m`, `OOMesh.m`, `Universe.m`, `PlayerEntity.m`, `Entity.m`, `OOVoxel.m` or `OOMeshToOctreeConverter.m`, so the pin's line numbers hold). Checked and found faithful:

- `Octree.m` `isHitByLine` and `isHitByOctree`, `OOVoxel.m` cube tests, `offsetForOctant`, `change_oct`, the octant visiting order, the `hit_dist` rule, `ShipEntity.m` `doesHitLine:` subentity rule, `doOctreesCollide` including the recursion order and the return value, `absolutePositionForSubentity` and `absoluteIJKForSubentity`.
- The octree depth rule (`OOMesh.m:590-623`), root half-width and leaf size.
- The deliberately kept `Octree.m:552` transposition, which is a real Oolite bug and is correctly preserved as Oolite behaviour.
- `collideWithShip:` step by step, including the order of `adjustVelocity:` calls, the `0.05` and `0.1` double-literal compares, the 1 m/s solution, the subentity branches and the nudge using the pre-damage `selfDestroyed`.
- The player drift braking (`PlayerEntity.m:3372-3405`), the NPC braking (`ShipEntity.m:5808-5823`), `PlayerEntity takeScrapeDamage:` and `dealMomentumWithinDesiredRange:` including the subentity-first explosion order and the absolute-position rule at `becomeExplosion`.

All 75 fixture citations point at files and line ranges that exist.

The vendored meshes cannot hide a bounding-box divergence: all six have no unused vertices and no degenerate faces, so the "all vertices" bounding box of `OOMesh.m` and the oracle's "non-degenerate triangles" box agree.

I ran the three test files in Docker (`docker compose run --rm test npx vitest run tests/oracles/combat tests/sim/combat/dock-mouth.oracle.test.ts`): 68 of 68 pass.

No oracle defect that would let a real sim bug through a load-bearing check was found. Two warnings and four info items follow. The `destroyable: false` masking, the missing scoop, station and `canCollide` branches, and the float64 octree arithmetic are recorded cuts (18-03 and 18-02 SUMMARY, file headers) and are not findings.

## Warnings

### WR-01: Blast unit vector rounds `1/sqrt` once, Oolite rounds twice (header claim of step-by-step float fidelity is false)

_(lane 4, originally WR-01)_

**File:** `tests/oracles/combat/response/reference.ts:538` (claim at `:26-28`)
**Issue:** The header says `sqrt` is "the double function" and every float operation is rounded step by step. `OOMaths.h:47` includes `<tgmath.h>`, so in `vector_normal_or_fallback` (`OOVector.h:247-253`, `1.0f / sqrt(mag2)` with a float `mag2`) the call resolves to `sqrtf` and the quotient is a float division of two floats: `f(1 / f(sqrt(mag2)))`. The oracle computes `f(1 / Math.sqrt(mag2))`, which skips the intermediate float rounding. The two differ by one float ulp for about 28 percent of random inputs (measured over 200,000 samples). Evidence in the fixtures: `blast-krait-several-receivers` (receiver at `(-410,210,145)`, `mag2 = 7000`) gets a unit scale of 0.011952285654842854 in the oracle against 0.011952286586165428 from the C expression, a relative difference of 7.8e-8. The fixture's `dv` and the self test therefore encode the non-Oolite value. It stays under the fixtures' 1e-6 tolerance, so no consumer fails today, and the hand anchor (`mag2 = 100`, exact `sqrt`) cannot reveal it. This is an unrecorded divergence from the stated "bit-exact" model, and a port that copies the oracle's expression inherits it.
**Fix:**
```ts
const mag2 = magnitude2f(p2);
const unit: Vec3 =
  mag2 === 0 ? [0, 0, 0] : scalef(p2, f(1 / f(Math.sqrt(mag2)))); // sqrtf, then 1.0f / float
```
Correct the header sentence to say `sqrt` of a float is `sqrtf` under tgmath (results of `v1a` and `magnitude` are unchanged, because a correctly rounded double `sqrt` rounded to float equals `sqrtf`), regenerate `blast.json`, and add a hand anchor with a non-square `mag2` (for example 7000) so a single-rounded unit vector fails.

### WR-02: Response fixtures are generated from `reference.ts` and re-checked by `reference.ts`; hand anchors cover a small slice

_(lane 4, originally WR-02)_

**File:** `tests/oracles/combat/response/response.self.test.ts:143-150, 426-439, 467-474, 496-503` (generation recorded in `18-03-SUMMARY.md:29`)
**Issue:** The fixture JSON was produced by a scratch script that imports the reference, and the self test "re-derives" every value through the same function, so for those values the check cannot fail unless a fixture is hand-edited. Independence rests on the hand anchors only, and those cover:
- collide: 3 rows (equal-mass head-on, two separating rows) plus one structural property of the subentity row;
- braking: only `perTickLoss` of one player row and one buoy row;
- scrape: only the forward-absorbed case;
- blast: one case, and it is the floored branch (`d2 = 0.1`) with an exact `sqrt`.

Not hand-anchored: the cleanup-band rate formula (`brake-player-cleanup-band`, `-above-full-cleanup`), the torus-factor rows, `firstTickLoss`, `stopTick`, `positionChange`, the NPC `fmaxf` clamp, the aft-overflow and `-negative-amount` scrape rows, the non-floored blast `d2 = magnitude2 - r^2` path, and every `dam2Receiver: "otherParent"` row. I traced each of these against the C and they match, so no wrong value exists today. The weakness is that a future edit to `reference.ts` is regenerated into the fixtures and passes the self test, with no committed generator (the scratch script lives outside the repository) to make the regeneration reviewable.
**Fix:** Add one hand-worked anchor per uncovered branch above (the cleanup-band tick-1 loss `0.2666666805744171 + f(3000 x f(f(1000/3000) x 0.001))`, an unfloored blast `d2`, an aft-overflow scrape, the `otherParent` damage receiver). Commit the generator (for example under `tools/` or as a documented `--update` mode of the self test) so the fixtures can be regenerated, with a diff to review, instead of by an out-of-tree script.

## Info

### IN-01: The buoy-subentity contact branch of the collision stage cannot occur with the production hull table

_(lane 1, originally IN-01)_

**File:** `src/sim/combat/collide.ts:746-774`, `src/sim/combat/collide.ts:813-817`
**Issue:** This is dead code (quality, not necessity). `buoySub`, `BUOY_SUBENTITY_MASS`, `world.buoys[..].subentityEnergy`, the dam2 record on static id 6 or 7, and `dvOtherSubentity` / `dpOtherSubentity` exist for a contact whose touched part is a buoy's frangible subentity. That part is only returned when the buoy is the non-prime body and the prime's octree touches the subentity without touching the buoy hull (`doOctreesCollide` stage 3). When the buoy is the prime, stage 2 returns the other's hull, so the contact is the buoy's body (the owner decision of 2026-11-20, `collision-buoy.test.ts:508`).

I probed the real tables in the test container with `fullHullTable()`:
- Every ship hull and the Cobra (always the prime, which is a superset of the prime rule), random poses on both orientations: 0 subentity contacts in 40,000 poses per hull.
- The barrel and the alloy plate are the only hulls that ever touch the subentity alone (92 and 103 of 40,000 poses when forced prime). Under Oolite's z-order prime rule, over about 210,000 sphere-overlapping poses each (about 4,800 and 3,900 of them with the pod first in z), the count was 0 and 0.

Probe scripts were run from `/tmp/scr`; no tracked file was changed.

The only tests of this branch (`collision-buoy.test.ts:385`, `:434`) run on a synthetic table (`PRIME_BARREL_HULLS`, the barrel's radius raised above the buoy's). The FIDELITY row for "a contact on a buoy's frangible subentity" therefore describes behaviour no run of the app can produce. This rests on a random sample, not a proof, and the sample is the evidence for Info rather than Warning.
**Fix:** Keep the branch if it is meant to guard a future content change, but record that fact: add a note to the FIDELITY row and to the `collide.ts` header that the branch is unreachable with the shipped hulls. Better, add a guard test that scans the real table for a subentity-only contact under the prime rule (the probe above is about 25 lines) and fails the day content makes it reachable, so the synthetic-table tests stay meaningful.

### IN-02: `positionOf` falls back to the player's position for a buoy collider without a layout

_(lane 1, originally IN-02)_

**File:** `src/sim/combat/collide.ts:602-607`
**Issue:** When `c.buoy !== undefined` but `layout === undefined`, `positionOf` skips the buoy branch and returns `c.entity?.position ?? player.position`, which is the player's position. The branch cannot be taken: `gatherColliders` (`:457`) adds buoys only when `layout !== undefined`. If a later edit ever made it reachable, every buoy would silently sit on the player and ram it with an overlap of zero (the coincident-centre z-basis fallback), with no error.
**Fix:** Capture the dependency instead of re-checking it. For example, build the buoy position function once under the `layout !== undefined` guard and have `Collider` carry a `position(): Vec3` accessor, or throw or `return null` for a buoy without a layout, so the impossible state is loud.

```ts
const positionOf = (c: Collider): Vec3 =>
  c.buoy !== undefined
    ? buoyPosition(world, layout as SystemLayout, c.buoy)
    : (c.entity?.position ?? player.position);
```

### IN-03: `resolveShotHits` doc says its one world write is the buoy flag; it writes more

_(lane 1, originally IN-03)_

**File:** `src/sim/combat/step.ts:407-409` (compare `:476-480`, `:555-560`)
**Issue:** The rewritten sentence reads "It applies no damage; its one world write is a buoy's sticky routing flag". The function also recharges every live ship and, new in Phase 18, every buoy and its subentity (`rechargeShips`, `rechargeStatics`), cools every weapon (`coolShips`), and moves an NPC shooter's `missedShots` (`shooter.missedShots`). The "one world write" claim is therefore false, and it is the sentence a reader would use to decide whether the function can be called a second time or reordered.
**Fix:** Reword to list the writes, for example "It applies no damage. Its world writes are the per-tick recharge and cooling, an NPC shooter's `missedShots`, and a buoy's sticky routing flag (below)."

### IN-04: The `proximity.ts` rationale for buoy-only prefiltering contradicts the todo's own measurement

_(lane 1, originally IN-04)_

**File:** `src/sim/npc/proximity.ts:43-46`
**Issue:** The header says the prefilter covers buoy pairs only because, "applied to every pair it moves the Phase 14 station case (c) of `proximity.test.ts`". The pending todo `.planning/todos/pending/2026-11-20-collision-chain-prefilter-all-pairs.md` records that this was measured with a work-in-progress port that sorted by centre. With Oolite's lower-edge sort the all-pairs version left every Phase 14 suite unchanged (38 files, 1,655 tests). The remaining reason for the deferral is the unmeasured QUAL-11 acceptance totals. The deferral itself is sound, but the code comment still states the disproven reason, so the next reader will believe case (c) blocks the change.
**Fix:** Replace the sentence with the current reason: "the all-pairs version is not applied because its effect on the QUAL-11 acceptance totals is unmeasured (todo ...)". The same stale sentence may also sit in the PD-08 and FIDELITY rows; the todo's fix step 3 already schedules those.

### IN-05: Several lane tests log or record instead of asserting, and one export is test-only

_(lane 1, originally IN-05)_

**File:** `tests/sim/npc/buoy-proximity.test.ts:316-322`, `tests/sim/npc/buoy-proximity.test.ts:274-276`, `tests/sim/combat/collision-traffic.scenario.test.ts:370-374`, `src/sim/npc/collision-chain.ts:208`
**Issue:**
- `buoy-proximity.test.ts:316` ("records the alert tick, the onset distance and the closest approach") asserts only `Number.isFinite(closest)`. It computes `contactAt` and `contact` and prints them with `console.log` but never asserts them. The `control` test at `:337` computes `closest` and only logs it. Lines 274-276, 317-319, 338 and 417-447 also print `BUOY-PROX` lines.
- `collision-traffic.scenario.test.ts` classifies contacts and kills for 4,000 ticks but asserts only finiteness, bounds, "no pair twice in one tick" and `report.ships > 0`. The report is printed, never compared. A regression that silently stopped all collisions (`contacts` all zero) would pass. The title says "sanity bounds", so this is by design, but it is the only populated-world guard for the stage.
- `chainEliminated` (`collision-chain.ts:208`) is exported and used only by `buoy-proximity.test.ts`; nothing in `src/` calls it.
**Fix:** Either turn the logged numbers into pinned expectations (the alert tick, onset, closest approach and the per-seed contact and kill counts are deterministic) or drop the console output. In the scenario test, at minimum assert `contacts["ship-ship"] + contacts["ship-buoy"] > 0` for the epoch-101 and epoch-202 seeds so the run cannot pass vacuously. Make `chainEliminated` module-private or move it to the test.

### IN-06: `debris.ts` module header still says debris is not a laser, ident or scanner candidate

_(lane 2, originally IN-01)_

**File:** `src/sim/world/debris.ts:67-69`
**Issue:** The header states "Debris is no laser, ident, scanner, mass-lock or jump-blockage candidate in this phase
(D16-03, OC-3): the existing `kind === "ship"` ... filters already exclude it." Phase 18 made pods and plates laser and
ident candidates: `src/sim/combat/step.ts:535`, `src/sim/combat/ledger.ts:248`, `src/sim/combat/collide.ts:487` and
`src/sim/combat/ident.ts:107` all accept `kind === "cargo"`, and `src/sim/world/entity.ts:80-86` and `kill.ts:129-138`
document exactly that. The sentence is now false for lasers and ident (it is still true for mass lock and jump blockage,
and for wreckage). A reader who trusts the header will wrongly conclude that a pod cannot be shot.
**Fix:** Rewrite the paragraph: pods and plates (kind `cargo`) are laser, ident and collision candidates since Phase 18
(D-07) and die at 0 energy through `killShip`; wreckage is none of these; neither blocks a jump or mass-locks
(`NON_LOCKING_SCAN_CLASSES`, D-08).

### IN-07: `sorted-lists.ts` states Oolite keeps insertion order for equal edges; the C inserts the newcomer before equal edges

_(lane 2, originally IN-02)_

**File:** `src/sim/world/sorted-lists.ts:3-9, 36-37` (and `compareOnAxis`, `:46-55`); same claim carried in
`src/sim/npc/collision-chain.ts:37`
**Issue:** The module says "The C moves a body past another only on a strict `<` or `>`, so ties keep insertion order;
here ties sort by ascending id." For a body that is moving, that is right. For a body being added, `addToLinkedLists`
walks `while (z_next && z_next->position.z - z_next->collision_radius < position.z - collision_radius)`
(`Entity.m:245-248`, same for x and y) and links the new body immediately before the first body whose edge is `>=` its own.
With an exact tie the newcomer therefore lands first, so among bodies added with equal edges Oolite's order is newest
(highest id) first, not ascending id. This only matters for exactly equal float edges (stacked spawns, test fixtures that
place bodies on the same z with the same radius), and it only flips which body is the octree prime when two bodies tie, so
it is low impact. It is also not recorded in FIDELITY.md, and the doc claim is wrong as written.
**Fix:** Either change the tie-break to `b.id - a.id` for the insertion case (and adjust `sorted-lists.test.ts` "ties by
ascending id" and the collision-chain tests) or, if the simplification is kept, correct the comment and add a FIDELITY row
("equal-edge ties in the sorted lists order by ascending id; Oolite orders the later-added body first on insertion").

### IN-08: `player-braking.oracle.test.ts` re-implements the flight step instead of driving it

_(lane 2, originally IN-03)_

**File:** `tests/sim/player-braking.oracle.test.ts:54-78`
**Issue:** The header says the fixtures are replayed "with the flight step's own per-tick integration", but `replay()` is a
hand copy of the block in `src/sim/flight/step.ts:323-334` (`position += drift*dt`, then `brakePlayerDrift`, with
`thrustFactor = speed > maxSpeed ? torusFactor : 1` computed once outside the loop). If the real step changed its order,
its thrust-factor rule, or started re-reading `state.speed` per tick, this oracle would stay green. The oracle still pins
`brakePlayerDrift` (the float32 arithmetic) correctly, and `tests/sim/flight-drift.test.ts:127-181` covers the real step for
the order and the torus factor, so there is no coverage hole, only a misleading claim.
**Fix:** Say in the header that the oracle pins the kernel and a transcription of the step, and that
`flight-drift.test.ts` pins the real step; or replay a fixture through `stepFlight` for one case.

### IN-09: Overlong comment lines left by the Phase 18 edits

_(lane 2, originally IN-04)_

**File:** `src/sim/world/step.ts:109-110`; `src/sim/world/debris.ts:35-36`; `src/sim/world/serialize.ts:265`
**Issue:** The in-place edits extended existing comment lines far past the file's 80-column wrap, for example
`step.ts:110` ("... though its drift velocity is (`stepShipDrift` below). Each steered ship draws only from its own
"combat" stream,") and `serialize.ts:265` ("... acceptance detectors (`tests/acceptance/detectors.ts`). The mutation is
harmless there because it"). Prettier does not reflow comments, so lint passes; it is only a readability regression in
paragraphs that were wrapped consistently before.
**Fix:** Re-wrap the three paragraphs.

### IN-10: FIDELITY.md rows keep stale Wegolite line pointers after this phase moved the functions

_(lane 3, originally IN-01)_

**File:** `FIDELITY.md:65-66`, `FIDELITY.md:76`, `FIDELITY.md:82-83` (rows E-45, E-46, E-123, E-53, E-54)
**Issue:** Phase 18 inserted code into `ident.ts`, `shields.ts` and `ledger.ts` and re-flowed these table rows. The row for E-52 was re-pointed to the new `ident.ts:158`, but five neighbouring pointers still carry their pre-phase values and now land on unrelated lines:

| Row | Mechanic | Cites | Actual location now |
| --- | -------- | ----- | ------------------- |
| E-53 | Ident key | `src/sim/combat/ident.ts:146` | `stepIdent` is at `ident.ts:218`; line 146 is the tail of the `isValidTarget` / `firstEntityTargetedByPlayer` doc comment |
| E-54 | Untarget key | `src/sim/combat/ident.ts:146` | same as E-53 |
| E-46 | Cabin cooling | `src/sim/combat/shields.ts:175` | `coolCabin` is at `shields.ts:224`; line 175 is inside `routeScrapeDamage`'s doc comment |
| E-45 | Overflow to energy and cabin heat | `src/sim/combat/shields.ts:152` | `routeDamage` is at `shields.ts:159`; line 152 is its doc comment |
| E-123 | Buoy subentity detachment | `src/sim/combat/ledger.ts:173` | the subentity branch is at `ledger.ts:182-192`; line 173 is inside the player branch |

`tests/contract/fidelity.test.ts` only checks that the cited line is inside the file, so it cannot catch this. A reader following E-53, E-54 or E-46 lands in the wrong function.

**Fix:** Re-point the five cells:
- E-53 and E-54: `src/sim/combat/ident.ts:218`.
- E-46: `src/sim/combat/shields.ts:224`.
- E-45: `src/sim/combat/shields.ts:159`.
- E-123: `src/sim/combat/ledger.ts:182`.

Optionally extend the contract test so a Wegolite pointer must land on a line that opens an `export function`, `function` or `const` declaration, or on its doc block.

### IN-11: Ragged comment reflow left by the phase edits

_(lane 3, originally IN-02)_

**File:** `src/app/hud-model.ts:11-15`, `src/app/session/step-options.ts:9`, `src/app/session/step-options.ts:78-79`
**Issue:** Inserted sentences broke the existing line wrapping. `hud-model.ts` leaves an orphan fragment, "`(HudModelOptions.buoys`). The" followed by a line that restarts mid-sentence. `step-options.ts` has a line of about 97 characters ("station's and the buoys' witchspace masses and the dock geometry. This module is the one place") followed by a short line, and a docblock paragraph whose second line is cut at "Optional keys are omitted rather than set to". Prettier does not wrap comments, so the formatting gate does not flag it. No behavioural impact.
**Fix:** Re-wrap the three comment blocks to the file's existing width.

### IN-12: The dock tolerance derivation is not a bound for oblique planes, and one fixture uses 74 percent of it

_(lane 4, originally IN-01)_

**File:** `tests/oracles/combat/geometry/derive.ts:181-195` and `schema.ts:23-30`; fixture `dock-tris-corner-oblique` in `fixtures/dock-mouth.json`
**Issue:** The comment proves `sqrt(3) h + 2 h / sin(alpha)` as "up to 2h/sin(alpha) before the exact hit". That slab depth of 2h holds only for a plane normal along an axis; a solid cell touching a plane with normal `(1,1,1)/sqrt(3)` extends `2 sqrt(3) h` along the normal. The tris fixture (incidence 35.3 degrees, such a normal) is the case: running the oracle's own C-model (`octreeModelAnswer`) gives an octree distance error of 30.07 m against a tolerance of 40.64 m (74 percent). The other 17 hit fixtures use 7 to 42 percent. A real-engine run (float32 builder, different clipping) has only 10.6 m of headroom on that fixture.
**Fix:** Either state the derivation as an empirical bound that the self test verifies, or use `h (|nx|+|ny|+|nz|) 2 / sin(alpha)` with the struck triangle's normal in `dockTolerance`, and re-derive the fixture tolerance.

### IN-13: The dock-mouth consumer discards the oracle's own octree answer and accepts a 4x slack

_(lane 4, originally IN-02)_

**File:** `tests/sim/combat/dock-mouth.oracle.test.ts:164-176`
**Issue:** The test checks the sim's distance against the exact surface distance with the up-front tolerance (29 to 31 m for most coriolis fixtures, 7 m for the buoy). The oracle already contains a transliteration of the C line test (`octreeModelAnswer`), and on 90-degree fixtures its answer is within 7.3 m of the exact distance. A sim octree whose visiting order differs from `Octree.m:395-441` and reports a leaf one or two cells off along the beam (a 7.8 to 15.6 m shift) still passes. Part naming and the subentity position, depth and radius assertions do catch the larger faults.
**Fix:** Optional hardening: store the model's octree distance per fixture (`octreeDistance`) and, for `edge: false` fixtures, also assert the sim within one leaf width (`2 h`) of it. Keep the wide tolerance for the real-engine comparison.

### IN-14: Dead code in the oracle tree

_(lane 4, originally IN-03)_

**File:** `tests/oracles/combat/response/reference.ts:57`; `tests/oracles/combat/geometry/derive.ts:179`; `tests/oracles/combat/geometry/octree-collide.ts:100-105, 116, 139-142, 154-156, 168-169, 181, 195, 201-203, 211, 225`
**Issue:** `DT` is exported and never used inside the tree (`input.dt` is used; the sim test imports its own `DT` from `src/sim/step.js`). `MIN_INCIDENCE_DEG` in `derive.ts` duplicates `DOCK_MIN_INCIDENCE_DEG` in `schema.ts` and has no reader. The `trace` parameter and `OctreeTrace` machinery in `isHitByOctree` (string formatting at every call site) is never passed by any caller, test or fixture.
**Fix:** Delete `DT` and `MIN_INCIDENCE_DEG`; either remove the trace plumbing or keep it behind one tiny helper and use it in a test that pins one trace.

### IN-15: `derive.ts` header misstates its imports

_(lane 4, originally IN-04)_

**File:** `tests/oracles/combat/geometry/derive.ts:9`
**Issue:** The header says the module "imports only `node:url` and this tree's own files". It imports no `node:` module at all (the `URL` it uses is the global; the filesystem read is in `dat.ts`, which imports `node:fs`). The independence guard (`tests/guards/oracle-independence.test.ts`) enforces the real rule, so this is documentation drift only.
**Fix:** Reword to "imports only this tree's own files (`dat.ts` reads the vendored meshes through `node:fs`)".

---

_Reviewed: 2026-11-20T17:36:17Z_
_Reviewer: Claude (gsd-code-reviewer, 4 lanes merged by the orchestrator)_
_Depth: standard_
