---
phase: 18
reviewers: [fable, opus, sonnet]
reviewed_at: 2026-11-19T15:57:00Z
plans_reviewed: [18-01-PLAN.md, 18-02-PLAN.md, 18-03-PLAN.md, 18-04-PLAN.md, 18-05-PLAN.md, 18-06-PLAN.md, 18-07-PLAN.md, 18-08-PLAN.md, 18-09-PLAN.md, 18-10-PLAN.md, 18-11-PLAN.md, 18-12-PLAN.md, 18-13-PLAN.md, 18-14-PLAN.md, 18-15-PLAN.md, 18-16-PLAN.md, 18-17-PLAN.md, 18-18-PLAN.md, 18-19-PLAN.md, 18-20-PLAN.md]
models:
  fable: "fable"
  opus: "opus"
  sonnet: "sonnet"
model_sources:
  fable: "agent-alias"
  opus: "agent-alias"
  sonnet: "agent-alias"
---

# Cross-AI Plan Review — Phase 18

Reviewed by three independent Claude subagents (own models, per the owner's standing rule; no external CLIs), each over all 20 plans at commit `2f9eb47`, with a primary focus: Fable — Oolite fidelity and determinism; Opus — executability, sequencing, code grounding; Sonnet — tests, oracle independence, persistence, security. The orchestrator spot-checked the three HIGH findings against source (all confirmed).

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Consensus Summary

Overall risk: MEDIUM from all three reviewers. Grounding is strong (cited paths, interfaces and Oolite lines check out); the ported rules come from the right half of the C with no sign errors; no path found that breaks 30/60/144 Hz equality or pristine-omit hashes.

### Agreed Strengths
- Ported rules (collideWithShip, scrape, blast, subentity hit rule, jump blockage) trace to the correct Oolite lines (Fable, Opus).
- Hash/snapshot design — pristine-omit, strict bounds, diff-gated goldens — is sound (Sonnet, Fable).
- Oracle structure (independent fixtures with C citations) and the tracer-first ordering (all three).

### Agreed Concerns (highest priority)
1. **HIGH — 18-18 player-death tripwire cannot work as written** (Sonnet, Opus). The guard fails when `src/sim/events.ts` names `playerDestroyed`, but that kind is already declared (`src/sim/events.ts:179`, `:227`; confirmed). Key it on a producer (an emit site of `playerDestroyed` in `src/sim`, or a `"dead"` FlightMode), not the declaration.
2. **MEDIUM — 18-20 ram probe cannot reach contact** (Fable, Opus). A 100 m/s drift started 300 m out brakes at 32 m/s² and stops after ~156 m. Also (Opus) a measured mismatch "stops the plan" but gates nothing: 18-04, 18-16, 18-07 consume the same fixtures/evidence without depending on 18-20.
3. **MEDIUM — station contact ignores the new player drift** (Fable, Opus; 18-10/18-11, `src/sim/dock/step.ts:101-102`): a pushed player re-bounces every tick at the dock face; docking is proven only at zero drift.
4. **MEDIUM — no browser coverage of the headline criteria; static-hull chunk outside `budget.spec.ts`** (Sonnet, Opus; 18-13): statics load only with traffic on, the e2e build is traffic-off, `loadStaticHulls` failure path unspecified, and the QUAL-11 acceptance run never enables collisions, so it cannot exercise the new paths.

### Divergent / single-reviewer findings worth acting on
- **HIGH (Fable) — 18-02 and 18-09 share a wrong sentence:** "the axial octree is the larger by radius". In the C the axial tree is always the caller's (prime) tree (`Octree.m:473-477`, `ShipEntity.m:1897`); the radius comparison (`Octree.m:497`) only selects which crude prune runs. Confirmed by the orchestrator. Because oracle and port share the error, fixtures would pass a wrong port.
- **HIGH (Opus) — NPCs will ram buoys.** Buoys become colliders but are not proximity candidates (`src/sim/npc/proximity.ts:16-21`, a Phase 14 recorded choice; confirmed). Oolite alerts NPCs to any ship over 2,000 kg (`CollisionRegion.m:308-311`, `ShipEntity.m:6107`), so they steer around buoys; here a Krait at 100 m/s would take ~1,397 damage and die. No gate sees it (acceptance runs never enable collisions). Needs an owner decision.
- **MEDIUM (Fable) — 18-15 subentity routing is sticky in Oolite:** `subEntityTakingDamage` is set on a subentity hit and not cleared by a later hull hit (`Universe.m:5634-5636`, `ShipEntity.m:10202`, `10409`); the plan routes per shot. Port or record.
- **MEDIUM (Sonnet) — 18-03/18-19 expected values in plan text** (68.1, 0.027, 0.0007, 0.06, 18.1, 1.3, 0.013 m/s) are visible to the oracle author, against "derive, never copy".
- **MEDIUM (Opus) — 18-03/18-16 single `dvOther`** cannot express Oolite's case where the rammer dies against a buoy's subentity and the buoy still keeps its push.

---

## Fable Review

## Phase 18 plan review — Oolite fidelity and determinism (fable)

Reviewer focus: every ported rule against the Oolite C source at `/home/opencode/git/oolite/src/Core`, plus float32/double, frame-rate dependence, 30/60/144 Hz equality and pristine-omit hashes. Read-only; nothing was run. Plan paths are relative to `.planning/phases/18-stations-buoys-and-collisions/`. Oolite paths are relative to `/home/opencode/git/oolite/src/Core/`.

Severity totals: **1 HIGH, 3 MEDIUM, 13 LOW**.

What I checked and found correct (so later sections can be short): the `collideWithShip` sequence and its asymmetries (`Entities/ShipEntity.m:11020-11152`), the right-half damage formula (`:11089-11090`), the heat-free player scrape (`Entities/PlayerEntity.m:5701-5753`), player braking with raw thrust and integrate-then-brake order (`Entities/PlayerEntity.m:3376-3404`), NPC and buoy braking with brake-then-integrate order (`Entities/ShipEntity.m:5808-5823`, `Entities/Entity.m:868-882`; a tumbling buoy does reach `applyThrust`, `ShipEntity.m:2485-2491`, `2633-2637`), the blast formula and its in-range test (`ShipEntity.m:7680-7698`, `8123-8126`, `Universe.m:5862-5868`), the laser subentity rule (`ShipEntity.m:1323-1357`), the jump-blockage rule and the mass drop on a dead subentity (`ShipEntity.m:12498-12531`, `8185-8194`), the compass fallback (`PlayerEntity.m:4655-4659`), and ident (`Universe.m:5689-5706`).

---

### 18-01

**Summary.** Measures the Coriolis octrees and ships the four static hulls with subentities in their own artifact.

**Strengths.** `frangible` is compiled per hull from the right default (`Entities/ShipEntity.m:376`, default YES), so the buoy/Coriolis difference that drives PD-01 comes from data, not from a hand-typed flag (`18-01-PLAN.md:33`). A non-identity subentity orientation fails the build (`18-01-PLAN.md:32`), which keeps the "shift the beam by the authored position" shortcut honest against `absoluteIJKForSubentity` (`ShipEntity.m:2008-2025`).

**Concerns.** No findings in focus.

**Suggestions.** None.

### 18-02

**Summary.** Independent geometry oracle: dock-mouth rays from the meshes, and a transliteration of `isHitByOctree` / `doOctreesCollide`.

**Strengths.** The soundness property (reference hit implies a brute-force cell overlap) and the pruned-corner fixture are the right way to pin Oolite's crude prunes as a subset of exact geometry (`18-02-PLAN.md:30`, `:187`). Tie rule for the hull is right: `hit_distance > hitSub` is strict (`ShipEntity.m:1350`).

**Concerns.**

- **HIGH — the oracle is told the wrong rule for the "axial" octree, and the port plan repeats it, so the two cannot disagree.** `18-02-PLAN.md:29` ("the axial choice by radius") and `:189` ("The axial octree is the larger by radius (the C's choice)") and `18-09-PLAN.md:141` ("the axial octree is the larger by radius as in the C") all say the same thing; the source is `18-RESEARCH.md:290`. The C does not choose: the axial octree is always the receiver, i.e. `prime` (`Octree.m:473-477`, called as `[prime_octree isHitByOctree:other_octree ...]` at `ShipEntity.m:1897`). The radius comparison at `Octree.m:497` only selects which crude prune runs (other sphere against axial cube at `:499-503`, or axial sphere against other cube at `:504-512`). After that the decomposition depends only on solidity: axial solid decomposes the other (`:519-559`), otherwise the axial is decomposed (`:560-594`). A port that swaps the trees so the larger is axial changes the octant visiting order, the sign conventions (`nextPosition = otherPosition - resolve(offset, ijk)` at `:551-552` against `otherPosition + offset` at `:588`) and which prune applies at each level. Because the oracle and the port receive the same wrong sentence, the "independent" fixtures, including the one that "pins that asymmetry", would pass against a wrong port. The real asymmetry to pin is prime against other with the same pair, not larger against smaller.
- **LOW — fixtures express a rotated other as ijk, the port takes quaternions.** The Oolite-to-Wegolite map (x, y, -z) is a reflection, so a quaternion cannot be mapped by negating one component of the axis naively (`18-02-PLAN.md:103`, `18-09-PLAN.md:170`). A wrong map still gives a valid rotation and plausible answers.

**Suggestions.** Reword both plans to: "the axial octree is always prime (`Octree.m:473`, `ShipEntity.m:1897`); the radius comparison selects only the crude prune (`Octree.m:497-512`)", and add one fixture where prime is the smaller tree and one where it is the larger, both with expected values written from a hand trace of the C, not from the reference. Keep fixtures in ijk and have the consumer build the quaternion from the basis with a round-trip assertion (rotate the three unit axes, compare with ijk).

### 18-03

**Summary.** Independent response oracle: `collideWithShip`, braking, scrape, blast.

**Strengths.** The step list in `18-03-PLAN.md:28` matches the C line by line, including the two details most often lost: the destroyed flags are read before damage (`ShipEntity.m:11111-11112`) and a subentity contact uses the subentity's mass and energy but the parent's velocity (`:11054`, `:11057-11066`, `:11103-11105`, `:11123-11128`). The fixture for the C's displacement of the subentity inside its parent (`:11143-11146`) as a separate field is correct. Blast `d2` uses the receiver's radius (`ShipEntity.m:7685-7686`), which is the easy one to get backwards.

**Concerns.**

- **LOW — float choice is inconsistent with the C at exactly the thresholds the branch fixtures sit on.** `18-03-PLAN.md:155` prescribes `Math.fround` for m1, m2, v2b, v1a, t and "float64 for the double dam1, dam2". In the C, `dam1 = m2 * v2b * v2b / 50000000` (`ShipEntity.m:11089-11090`) is a GLfloat expression (GLfloat operands and an int) widened on assignment, and `magnitude2(v)` is a float compared with the double literal 0.1 (`:11096`). Consequences for the planned boundary fixtures (`18-03-PLAN.md:149`): the float nearest 0.1 is 0.100000001490116, which is not `<= 0.1`, so "|v|^2 = 0.1 exactly takes the anti-conjoin branch" is not what Oolite does; the float nearest 0.05 is above the double 0.05, so "dam exactly 0.05 applies nothing" is not Oolite either. Plan 18-16 uses the same choice (`18-16-PLAN.md:97`), so the port and the oracle agree with each other and not with the C. Impact is confined to measure-zero boundaries, but these fixtures claim to pin the C's compare.
- **LOW — the buoy blast fixture uses the composite mass.** `18-03-PLAN.md:184` pins "a buoy victim (698,691.1875 kg, 59.14 m)". In `becomeExplosion` the ship subentities explode first (`ShipEntity.m:8115-8120`), each calling `subEntityDied` on the parent, which does `mass -= [sub mass]` (`:7901`, `:8185-8194`); only then does the parent deal momentum with `0.125f * mass` (`:8123-8126`). A buoy that dies with its subentity attached therefore blasts with 691,044.40 kg, and the subentity deals its own, separate blast (0.125 x 7,646.79 kg, range 2.5 x its own radius, from its absolute position). The fixture is about 1.1 % high and omits the second source.
- **LOW — the slow-separating fixture should state the total self displacement.** For `-1 <= v2b < 0` the C moves self by `-hploc` (`:11083`) and later also by `loc * t * v1a` with a negative `v1a` (`:11141-11142`), and moves the other by `loc * t * v2b`, i.e. toward self (`:11144-11145`). `18-03-PLAN.md:148` and `18-16-PLAN.md:147` mention only the 1 m.

**Suggestions.** Either compute dam and `|v|^2` with `Math.fround` at each operation, or keep float64 and move the boundary fixtures off the exact thresholds, stating in the schema that exact-threshold behaviour is not pinned. Derive the buoy blast with the hull-only mass and add the subentity's own blast as a recorded divergence if it is not ported.

### 18-04

**Summary.** The Coriolis as a laser target through the subentity rule; it absorbs.

**Strengths.** The loop in `18-04-PLAN.md:230` is the C's: hull first, each subentity in list order, accept on `hitSub > 0 && (hit === 0 || hit > hitSub)`, then the outer `hit > 0 && hit < nearest` (`ShipEntity.m:1332-1356`, `Universe.m:5621-5631`). Stage A already uses a radius that includes the dock (`ShipEntity.m:2028-2040`). Absorbing without touching `staticHealth.station` keeps the pristine hash (`18-04-PLAN.md:34`) and matches the guard `amount < energy` (`Entities/StationEntity.m:1150-1154`).

**Concerns.**

- **LOW — an unrecorded consequence of shooting the main station.** Before the damage guard, Oolite marks the shooter an offender (bounty 64, 96 for an energy mine) and launches police when the station has a JS AI (`Entities/StationEntity.m:1128-1141`). No plan mentions it (`rg -i "offender|bounty|legal"` over the plans finds nothing). "The station only absorbs" is true for energy, not for consequences.

**Suggestions.** Add a FIDELITY row for the missing offender mark, or a todo with a tripwire if legal status exists in the sim.

### 18-05

**Summary.** Buoys hold 250 energy, recharge 2/s, are destroyed at zero at their live pose.

**Strengths.** Destruction at "unfloored result 0 or below" matches `energy <= 0.0` after `energy -= amount`. The `value > 0` recharge guard prevents revival, and recharge reaching exactly 250 through `Math.min` restores the pristine hash (`18-05-PLAN.md:34`, `:200`). One pose function for hit and draw.

**Concerns.**

- **LOW — the "numbers checked" debris figure is from the wrong formula.** `18-05-PLAN.md:115` cites `n_alloys = floor(sqrt(sqrt(698,691 / 25,000))) = 2`. The C is `sqrtf(sqrtf(mass / 6000.0f))` (`ShipEntity.m:7916`; Wegolite's own `N_ALLOYS_MASS_UNIT = 6000`, `src/sim/world/debris.ts:206-209`), which gives 3.29. With `maxWrecks = 3`, `n_alloys < maxWrecks` is false, so a buoy always releases 3 wrecks (`ShipEntity.m:8050-8056`), then `n_alloys = randf() * n_alloys` gives 0 to 3 plates (`:8068`, `:8081`). The divergence being recorded is larger than the row will say.
- **LOW — the closed-form tumble is now a hit and collision pose.** Oolite integrates roll then pitch incrementally each frame (`behaviour_tumble` to `applySticks`, `ShipEntity.m:3724-3727`), which is not `roll(Z, 0.1 t) * pitch(X, 0.15 t)`. This was cosmetic while the buoy was only drawn; it now decides which cell a beam or hull meets. Deterministic, so no hash risk.

**Suggestions.** Correct the figures before they reach FIDELITY. Mention the closed-form tumble in the buoy pose row.

### 18-06

**Summary.** Ident over the station, buoys, pods and plates.

**Strengths.** Matches `firstEntityTargetedByPlayer`: `canCollide` and not `CLASS_NO_DRAW`, nearest centre with the strict `<`, cross-section test against the collision radius (`Universe.m:5689-5706`). Subentities are correctly excluded, since they are not in the entity list.

**Concerns.** No findings in focus.

**Suggestions.** None.

### 18-07

**Summary.** Live buoys block a completing jump with live pose and live mass.

**Strengths.** Rule, strictness and the scanner-range clause match `ShipEntity.m:12526-12527`. The mass after detachment (691,044.4013671875) follows `subEntityDied` (`ShipEntity.m:8185-8194`). The +-1 m test points around 264.33 m are far enough from the boundary that the C's float `k = 0.1` (`:12511`) cannot flip them. The field is read from the previous tick's world like every other field query, so there is no intra-tick order dependence. `buoyMass` absent keeps every world-less pin.

**Concerns.** No findings in focus.

**Suggestions.** None.

### 18-08

**Summary.** Presentation of a destroyed, moved or stripped buoy; compass fallback.

**Strengths.** The fallback is exactly `validateCompassTarget`: a nil or inactive beacon target sets `COMPASS_MODE_PLANET` and stays there (`PlayerEntity.m:4655-4659`); the plan's "later steps keep planet even if a field reports the buoy alive again" (`18-08-PLAN.md:202`) pins the permanence. The cycle divergence gets its own FIDELITY row with the correct Oolite order (`PlayerEntity.m:4761-4808`).

**Concerns.** No findings in focus.

**Suggestions.** None.

### 18-09

**Summary.** `isHitByOctree` and `doOctreesCollide` as pure kernels.

**Strengths.** The four-stage order and return values match `ShipEntity.m:1896-1941` (a prime subentity touching the other's hull returns `other`, not the subentity). Totality on malformed trees. Agreement test against the reference lives outside the oracle tree.

**Concerns.**

- **HIGH — same wrong "axial is the larger by radius" instruction as 18-02** (`18-09-PLAN.md:141`). See 18-02 for the C lines. Counted once.
- **LOW — float64 against the C's float32** is recorded (`18-09-PLAN.md:92`) and deterministic; fine for hashes, and fixtures are cell-centred.

**Suggestions.** As in 18-02. In the SUMMARY, record a hand trace of one two-level case against `Octree.m:519-594` so the literal claim has evidence that does not pass through the reference.

### 18-10

**Summary.** `FlightState.drift`, integrated then power-braked with raw thrust.

**Strengths.** Order and factor are right: `applyVelocity` first (`PlayerEntity.m:3376`), then `velmag - dt * thrust * thrust_factor` with no 5x (`:3388`), cleanup terms (`:3392-3399`), zero when negative (`:3400-3401`). Pristine-omit `drift=` line; every pose-reset site zeroes it. The torus factor is the only case to port because the flight code has no injectors (`rg -i "injector|afterburner" src/sim/flight` is empty), so `afterburnerFactor` at `:3380-3381` is unreachable.

**Concerns.**

- **MEDIUM — the station contact response ignores drift.** `respondToContact` builds the velocity as `forward * speed + impulse` (`src/sim/dock/step.ts:101-102`) and reflects only that. After this phase the player can reach the station with a drift of tens to hundreds of m/s (D-03's 68 m/s is 72 m of travel; a buoy rebound of 180 m/s is about 500 m over 5.6 s at 32 m/s^2). The drift is integrated every tick before `stepDocking` (`src/sim/flight/step.ts:305`, `:417`; plan `18-10-PLAN.md:172`) and the contact never cancels it, so the hull keeps being re-penetrated until the brake finishes, with a `bounce` per tick or a pass through a wall. In Oolite the station collision goes through `collideWithShip`, where `adjustVelocity` acts on the same velocity that carries the drift (`ShipEntity.m:11109`, `:11173-11176`). Criterion 4 ("touching the station hull stays damage-free, docking is unchanged") is proven only at zero drift (`18-11-PLAN.md:225`).
- **LOW — a float32 underflow can strand a non-zero drift.** With `Math.fround` on `velmag` (`18-10-PLAN.md:172`), a float64 drift below about 7e-46 has `velmag == 0`, the `if (velmag > 0)` branch is skipped (`PlayerEntity.m:3389`), and the drift is never zeroed, so the `drift=` line stays in the hash for the rest of the flight. Unreachable from the brake itself (the smallest non-zero step is one ulp near 0.27), reachable from a restored state. Same shape in `brakeShipDrift` (`18-17-PLAN.md:144`).
- **LOW — "exactly zero after 375 ticks" is exact-arithmetic reasoning.** With float32 `dt * thrust` the residue at tick 375 can be a positive ulp-sized value and zero only at 376 (`18-10-PLAN.md:163`).

**Suggestions.** Decide and record how drift meets the station: include a non-zero drift in `respondToContact`'s velocity and write the reflected remainder back (guarded by `drift !== 0` so the zero-drift path stays byte-identical), or zero the inward drift component on contact; add a test of a 68 m/s drift into the hull face. In both brakes, treat `fround(|v|) === 0` as zero. Take the stop tick from the 18-03 oracle rather than from 100 / (32/120).

### 18-11

**Summary.** The opt-in collision stage for the player, NPCs, pods and plates.

**Strengths.** `self` by distance from the player is the correct reading of Oolite's update order (`Universe.m:6437-6440`, `:6532-6534`; sort key at `:5086-5088` and `Entities/Entity.m:858`), and it replaces the weaker "lower id" assumption. The stage is fixed-step, uses `10 * DT`, sorts with an id tie-break and is gated by a flag the frozen harness never sets, so criterion 5 and QUAL-11 hold by construction. Total velocity is drift plus `forward * speed` (`ShipEntity.m:11154-11162`). No random draw is needed (`:11659-11667`). Strict `d^2 < (r1 + r2)^2` matches `CollisionRegion.m:296-320`.

**Concerns.**

- **LOW — "self is `doOctreesCollide`'s prime" is not Oolite's rule, and the plan states it as if it were** (`18-11-PLAN.md:35`). In Oolite prime is `e1` of the collision-chain sweep (`CollisionRegion.m:279-342`), which is independent of update order. It matters only for subentity routing: the subentity is returned only when the ship is `e1` (`ShipEntity.m:1909-1918`); when the buoy is `e1` its subentity touching the ship returns the ship (`:1899-1907`), and `e2`'s list always receives `e1` itself (`CollisionRegion.m:352-356`). Also, after a subentity contact `[[other collisionArray] removeObject:self]` (`ShipEntity.m:11150`) clears the subentity's list, not the buoy's, so the buoy processes the same contact again as `self` with its full mass whenever the first response left less than 1 m/s of separation (closing speed below about 5.3 m/s for the Cobra). Wegolite's rule is a reasonable deterministic choice; it needs a FIDELITY row, not a claim of equivalence.
- **LOW — a non-finite position makes the sweep comparator inconsistent.** `position.x - radius` (`18-11-PLAN.md:196`) is NaN for a NaN position; a comparator that is not a total order gives an engine-defined order. The sanitiser should make this unreachable, but the totality property in `18-18-PLAN.md:195` feeds NaN positions in.
- **LOW — the collisions-on path has no world-scale evidence.** QUAL-11 runs with the stage off, so it says nothing about traffic with the stage on. The frozen worlds have `MAX_HULL_CROSSINGS = 0`, so a run of the same seeds with `collisions: true` and `fullHullTable()` should report zero contacts.

**Suggestions.** Record the prime rule and the missing second pass as divergences. Drop non-finite colliders before the sort. Add an informational (not frozen, not a gate) test that runs a few acceptance seeds with collisions on and asserts `CollisionStats.contacts === 0` and unchanged hashes.

### 18-12

**Summary.** Phase close: todo moves, FIDELITY walk, `verify-full`, QUAL-11.

**Strengths.** One `verify-full` at the end, with the walk listing every rule.

**Concerns.** No findings in focus.

**Suggestions.** Add to the walk list (`18-12-PLAN.md:26`) the rows this review asks for: sticky subentity routing (18-15), the prime rule and second pass (18-11), drift against the station (18-10), the subentity's own blast and the hull-only blast mass (18-19), the offender mark (18-04), and the fixed `10 * DT` nudge against Oolite's frame-dependent `10 * getTimeDelta` (`ShipEntity.m:11139`).

### 18-13

**Summary.** Wires the static hull artifact into the session and the merged hull table.

**Strengths.** Both hull chunks load in the boot `Promise.all`, so no hit or collision depends on when a chunk arrives (`18-13-PLAN.md:105`); that removes a timing-dependent replay difference. `realHullTable()` stays ten hulls, so the frozen worlds cannot gain a candidate.

**Concerns.** No findings in focus.

**Suggestions.** None.

### 18-14

**Summary.** Per-world buoy state (offset, velocity, subentity energy), pristine-omit in snapshot and hash.

**Strengths.** Storing an offset rather than a position makes "pristine" independent of the layout. `-0` is already normalised by `noNegativeZero` (`src/sim/world/snapshot.ts:248`, `:374-378`) and by `canon` (`src/sim/hash.ts:33-34`), so a velocity scaled to `-0` by the brake neither prints nor breaks a snapshot. Subentity default 200 and recharge 1/s are Oolite's defaults (`ShipEntity.m:291-292`), and subentities do reach the recharge in `update` (`:2415-2424`).

**Concerns.** No findings in focus. Note only that the `buoys:` line is permanent after any ram (the offset never returns to zero), which is intended.

**Suggestions.** None.

### 18-15

**Summary.** The buoy's frangible subentity under laser fire; pods and plates as laser targets.

**Strengths.** Two records in the C's order (1 % on the parent, then the full amount on the subentity) match `ShipEntity.m:10202-10209` and `:10409-10416`. Pod and plate energy 1 with no recharge is the shipdata value (`Resources/Config/shipdata.plist`, `oolite_template_barrel` and `oolite_template_alloy`: `max_energy = 1`, `energy_recharge_rate = 0`).

**Concerns.**

- **MEDIUM — Oolite's routing is sticky; the plan routes by the winning part of each shot.** `firstShipHitByLaserFromShip` sets `subEntityTakingDamage` when a subentity wins (`Universe.m:5634-5636`) and never clears it when a later shot ends on the hull. The firing code does not look at the current hit; it reads `[victim subEntityTakingDamage]` (`ShipEntity.m:10202`, `:10409`). The only clears are a nil setter call at dealloc, the getter when the weak reference is dead, and `subEntityDied` (`:1041`, `:1245-1247`, `:8187-8188`). So once any shot from any shooter has ended on the buoy's subentity, every later laser hit on that buoy, hull hits included, puts 1 % on the buoy and 100 % on the subentity until the subentity dies. `18-15-PLAN.md:32` and `:172` ("when the winning part is a subentity") give the buoy full damage on those later hull hits. Observable: in Oolite a buoy whose subentity was touched once cannot be killed through the hull until 200 subentity energy is gone; in the plan it dies in 17 hull hits regardless. PD-01 says "as Oolite does"; no plan or research line mentions this (`rg -i "sticky|subEntityTakingDamage"` over the phase directory is empty).
- **LOW — PD-01's wording gives rams a 1 % bleed-through; the C does not.** `18-CONTEXT.md:136` says "A laser hit or ram ... puts `0.01 * damage` on the buoy body". For a ram the subentity of a frangible parent takes all of `dam2` and the parent nothing (`ShipEntity.m:11123-11128`; `takeScrapeDamage` has no bleed, `:11639-11673`). Plans 18-03 and 18-18 implement the C correctly (`18-18-PLAN.md:31`); the risk is that the Key Decision and FIDELITY rows copy the PD sentence.
- **LOW — detachment skips the subentity's own blast.** A dying subentity runs `becomeExplosion` and deals momentum itself (`ShipEntity.m:7895-7904`, `:8123-8126`). "No explosion" is recorded as a visual divergence; the push is a physics one.

**Suggestions.** Either port the sticky flag as one more per-buoy boolean (pristine-omit, set when a subentity wins, cleared at detachment) or record it explicitly as a divergence with the hit counts above; ask the owner, since PD-01 chose "as Oolite does". Write the ram rule in the decision rows from `ShipEntity.m:11123-11128`, not from the PD text.

### 18-16

**Summary.** `collideWithShip` and the heat-free scrape as pure kernels.

**Strengths.** The prohibition against "fixing" the nudge signs (`18-16-PLAN.md:48`) protects the C's literal behaviour: self moves by `+loc * t * v1a`, toward the other (`ShipEntity.m:11141-11142`). `destroyable: false` for the player keeps the Phase 20 boundary explicit. Totality properties over NaN, infinities and zero mass protect the hash from non-finite writes.

**Concerns.**

- **LOW — same float choice as 18-03** (`18-16-PLAN.md:97`): port and oracle share it, so the boundary fixtures cannot catch it. See 18-03.
- **LOW — a detail for the Phase 20 tripwire.** For the player `selfDestroyed = dam1 > energy` compares against the energy bank only (`ShipEntity.m:11111`), although the shields absorb first (`PlayerEntity.m:5726-5744`). In Oolite a player with full shields can survive a ram and still trigger the inelastic reversal and skip the nudge. The todo written by 18-18 (`18-18-PLAN.md:220`) should say so, or Phase 20 will "correct" it.

**Suggestions.** State in the `response.ts` header which C expressions are float and which double, and that exact-threshold behaviour follows the port's choice.

### 18-17

**Summary.** Drift integration and braking for NPC ships and buoys.

**Strengths.** Brake only when thrust is non-zero, `vscale = max((|v| - 5 * thrust * dt) / |v|, 0)`, then move: the C's order within one ship update (`ShipEntity.m:5808-5816`, then `Entity.m:868-869`). `statsFor(...).thrust` is the raw value (`src/sim/npc/stats.ts:40-41`; the 5x is applied at use, `src/sim/npc/flight.ts:156`), so there is no double factor. No ship in `src` is created with a non-zero velocity today (`rg "velocity\s*[:=]" src` finds only debris and plumbing), so the zero-velocity skip keeps the frozen worlds and every pin byte-identical. The sequence across a tick (response at the end of tick N, brake then integrate in tick N+1) reproduces Oolite's `manageCollisions`, `applyThrust`, `applyVelocity` order (`ShipEntity.m:2136`, `:2416`).

**Concerns.**

- **LOW — float32 underflow in `brakeShipDrift`**, as in 18-10: "zero or non-finite input returns zero" (`18-17-PLAN.md:144`) should be defined on the frounded magnitude.

**Suggestions.** As in 18-10.

### 18-18

**Summary.** Buoys as movers in the collision stage; cadence, cost, totality, the tripwire.

**Strengths.** The subentity contact is the C's: m2 is the subentity's mass, damage goes to the subentity with no bleed, the velocity change goes to the parent (`ShipEntity.m:11054`, `:11057-11066`, `:11103-11105`, `:11123-11128`), and the C's displacement of the subentity inside its parent (`:11143-11146`) is recorded rather than silently dropped. "When the buoy is self, a contact is the buoy body's" (`18-18-PLAN.md:169`) matches stage two of `doOctreesCollide` returning `other`. The cadence scenario covers all three contact kinds at 30/60/144 Hz.

**Concerns.**

- **LOW — the todo should carry the shield detail from 18-16** (see there).
- **LOW — `MAX_BUOY_OFFSET` and `MAX_ENTITY_VELOCITY` clamps are divergences at torus speed.** Buoys do not mass-lock (D-08), so a torus ram at up to 11,200 m/s is possible; Oolite's `v1a` of about 20,200 m/s is clamped to 1e4 per component. Harmless, deterministic, worth one line in the row.

**Suggestions.** Add the informational collisions-on acceptance-seed check proposed in 18-11 here, since this plan owns the cadence and cost evidence.

### 18-19

**Summary.** The blast pushes ships, buoys and the player; every exploding body is a source.

**Strengths.** Formula, floor, strict range and direction match `ShipEntity.m:7680-7698` and `Universe.m:5862-5868`. Applying the player's push after the kill loop, in ascending id, keeps the tick deterministic. Making pods and plates sources is correct: `becomeExplosion` deals momentum for every ship-class body (`ShipEntity.m:8121-8126`).

**Concerns.**

- **LOW — a dying buoy's blast mass and second source.** `18-19-PLAN.md:192`, `:197` use "its live mass" (`NAV_BUOY_MASS` with the subentity attached). In the C the subentity explodes first and reduces the parent's mass, and deals its own blast (see 18-03). About 1.1 % on the buoy's push, plus a missing small source.
- **LOW — two inaccurate justifications.** `18-19-PLAN.md:105` says "only the station is special". The station is not excluded by `addImpactMoment` (not overridden; only `adjustVelocity` is, `Entities/StationEntity.m:1159-1163`); it is excluded because its status is `STATUS_ACTIVE`, which `isInSpace` does not list (`Entities/Entity.m:1033-1041`). The same list includes `STATUS_LAUNCHING`, so Oolite does push a launching player; "the player receives a blast push only in flight" (`18-19-PLAN.md:107`) is therefore a divergence to record, not a neutral note.

**Suggestions.** Use the hull-only mass for a buoy that dies with its subentity attached and either add the subentity's blast or record its absence. Fix the two citations in the decision row.

### 18-20

**Summary.** PD-03 measurements on real Oolite.

**Strengths.** A mismatch never edits a fixture; the ram comparison uses the logged frame delta for the C's `10 * getTimeDelta` nudge (`18-20-PLAN.md:155`), which is the one place where real Oolite is frame-rate dependent and the port is not.

**Concerns.**

- **MEDIUM — the 100 m/s ram probe cannot reach the buoy.** `18-20-PLAN.md:155` places the player 300 m from the nav buoy "engines at rest" with "a drift velocity toward the buoy of 100 m/s". The player's drift brakes at `thrust` = 32 m/s^2 (`PlayerEntity.m:3388`), so it stops after 100^2 / (2 x 32) = 156 m. Contact needs the centres within about 59 + 73 = 132 m at most, i.e. at least 168 m of travel. The session ends with no contact, or the executor improvises. The 350 m/s session is fine (stopping distance 1,914 m) but arrives at about 334 m/s, not 350.
- **LOW — setting `velocity` from script while the engine speed is non-zero.** The JS setter works on the total velocity (`setTotalVelocity`, `ShipEntity.m:11164-11167`), so "engines at rest" must be asserted in the log, not assumed.

**Suggestions.** Start the 100 m/s case close enough that braking leaves a known closing speed (for example 150 m centre distance), or drive it with engine speed instead of drift and say which; in both sessions take `v2b` from the logged velocities on the frame before contact, as the plan already says for the comparison.

---

### Overall

**Risk Assessment: MEDIUM.**

The collision response, both brakes, the blast, the laser subentity rule, jump blockage and the compass fallback are read from the right lines of the right functions, and I found no sign error and no rule taken from `takeScrapeDamage`'s or `takeEnergyDamage`'s half. Determinism is well protected: everything runs inside the fixed 120 Hz step, the one frame-time read in the C (`10 * getTimeDelta`) is replaced by `10 * DT`, orders are by rank or id with tie-breaks, the stage is opt-in so the frozen worlds cannot change, and every new field is pristine-omit with `-0` already normalised. I see no path by which a world that never fires, idents or collides changes its hash.

What keeps the risk from LOW:

1. **HIGH (18-02, 18-09):** oracle and port share one wrong sentence about `isHitByOctree` ("axial is the larger by radius"); the C's axial tree is always prime (`Octree.m:473-477`, `:497`, `ShipEntity.m:1897`). The independent fixtures would pass a wrong port. Fix the wording in both plans before wave 1.
2. **MEDIUM (18-15):** Oolite's subentity routing is sticky (`Universe.m:5634-5636`, `ShipEntity.m:10202`, `:10409`); the plan routes per shot. Port it or record it; owner call under PD-01.
3. **MEDIUM (18-10, with 18-11 and 18-19):** drift is invisible to the station contact response (`src/sim/dock/step.ts:101-102`), and criterion 4's dock proof runs only at zero drift.
4. **MEDIUM (18-20):** the 100 m/s ram probe stops 156 m out and never touches the buoy.

The LOW items are recording and boundary matters: float choice at exact thresholds, the buoy's hull-only blast mass and the subentity's own blast, the wrong `n_alloys` divisor, the prime rule stated as Oolite's, the offender mark, and float32 underflow in the brakes.

All 20 plan ids are covered above.

---

## Opus Review

## Phase 18 plan review: executability, sequencing and code grounding (opus)

Reviewer focus: whether an executor working from each plan alone succeeds. I checked waves and depends_on against the data each plan consumes, read_first and action identifiers against the code at HEAD (`2f9eb47`; plan base `76229f5` exists and differs from HEAD only in `.planning/`), acceptance greps against the strings they look for, the guards and pins each plan touches, and the remote command lines against `/home/opencode/.claude/scripts/wegolite-remote-run.sh` and `tools/oolite-reference/run-remote.sh`. Oolite claims were checked in `/home/opencode/git/oolite` (HEAD `21978c37b`; the cited lines match).

Overall grounding is very good. Every test file a verify step names exists (I checked about 50 paths). Every "HEAD=1 match" anchor string an acceptance criterion removes exists at the cited place: `step.ts:353`, `hit.ts:17`, `debris.ts:601`, `hyperspace-controller.ts:137`, FIDELITY E-22/E-48/E-52, and the PROJECT.md rows at 192/264/285/298/306/307. The interface line numbers I sampled are accurate. The findings below are the exceptions.

---

### 18-01

**Summary.** Measures the Coriolis octrees and builds the four static and debris hulls as a separately bounded, lazily loaded artifact with a schema, golden, NOTICE and Key Decision.

**Strengths**
- Grounded. `checkHullTree(root, declaredDepth)` exists at `src/content/schemas/ship-hull.ts:58`, the caps sit at `:28-47`, `computeShipMasses` at `tools/oolite-ingest/convert/ship-mass.ts:178`, `collisionRadius` at `ship-radius.ts:168` (it already resolves non-flasher subentities through `resolveHull`), and the `emitShipHulls` call at `tools/oolite-ingest/generate.ts:221`. `debris.ts:44-45` confirms the keys `barrel` and `alloy`.
- The plan keeps the ten-hull caps fixed and checks that with a mechanical acceptance criterion (`18-01-PLAN.md:188-189`).
- Deriving the caps from the emitted file in Task 2 is a sound two-step approach.

**Concerns**
- LOW. The subagent brief (`18-01-PLAN.md:97`) says the checkout's lines "equal the pin `7437f22`", but the checkout HEAD is `21978c37b`. The brief gives the re-check command, and the lines I sampled match. No action is needed beyond running that command.
- LOW. The behaviour list asks for names "after like_ship resolution" from "the compiled catalogue's resolved `name`" (`:215`). The plan does not say which compiled structure holds a resolved `name`: the `shipDef` of `emitShipsFromCatalogue` or something else. An executor may have to resolve `like_ship` itself. Name the source field.

**Suggestions.** Name the catalogue field that carries the resolved `name`.

### 18-02

**Summary.** Independent geometry oracle: exact ray-mesh dock-mouth fixtures and a transliteration of `isHitByOctree` and `doOctreesCollide`.

**Strengths**
- The oracle-independence guard (`tests/guards/oracle-independence.test.ts`) allows `node:` built-ins, zod, vitest and relative paths, and refuses a `src` segment in a path-call literal. `third_party/oolite/...` has no `src` segment, so reading the vendored `.dat` files passes the guard as written.
- The margin rule (winner margin at least twice the tolerance, rays at least two leaf widths from edges) is the right way to make exact geometry decide an octree port's winner.

**Concerns**
- LOW. The tolerance needs "the leaf half-width ... by Oolite's depth rule" (`:150-ish`, Task 1 action). The port's octrees are built by Wegolite's converter (`tools/oolite-ingest/convert/octree.ts`), which the oracle may not read. If the oracle's derived depth differs from the depth actually emitted, the tolerances differ from what the port can achieve. The plan's fallback ("a conservative bound") covers this. Say explicitly that the bound is checked against the emitted depth when 18-04 consumes the fixtures, and that a mismatch there is a dispute, not a widened tolerance.

**Suggestions.** None beyond the above.

### 18-03

**Summary.** Independent response oracle: `collideWithShip`, braking, scrape and blast.

**Strengths**
- The transliteration list (`18-03-PLAN.md:31`) matches `ShipEntity.m:11020-11152` line for line, including the `canScoop` returns at 11035-11042 that PD-05 omits, the destroyed flags read before damage (11111-11112), and the `t = 10 x getTimeDelta` nudge.
- The blast truth uses the receiver's radius in d2 (`ShipEntity.m:7689`), which is the easy thing to get wrong.

**Concerns**
- MEDIUM (fidelity of a branch). `selfDestroyed` is specified as "the other's net velocity change is zero" (`18-03-PLAN.md:150`). That holds only for a whole-ship other. For a subentity contact, Oolite first applies `vel2a` to `otherParent` (`ShipEntity.m:11103-11106`) and then applies the reversal to `other`, the subentity (`11117-11119`). The parent keeps `+vel2a`. Plan 18-16 (`:148`) copies the same wording, and the `CollisionResponse` type has only one `dvOther`. The case is reachable after PD-01: a destroyable NPC dying against a buoy's subentity.
- LOW. The independence rule says CONTEXT and RESEARCH figures are "never used as an expected value", yet the Task 2 behaviour list quotes them (`:184`, "about 68.1 m/s", "about 18.1 m/s"). These are cross-checks, but an executor may hard-code them as anchors. Mark them as SUMMARY cross-checks only, as Task 1's action does.

**Suggestions.** Add a fixture for "subentity contact, self destroyed" that pins the parent's net `+vel2a`. Let `CollisionResponse` carry the parent and subentity velocity changes separately, or record the divergence.

### 18-13

**Summary.** Wires the static artifact into the session's boot `Promise.all` (traffic on only), merges it into `HullTable`, adds `fullHullTable()` and switches three app twins to it.

**Strengths**
- The anchors are exact. `hullTable` is at `src/app/session/traffic.ts:259-266` and the traffic-gated boot load at `start-session.ts:418-447`. `realHullTable` appears 7 times across the three twins (`tick-parity.test.ts:84,199`, `sim-driver.test.ts:65,650,1541`, `probe-publisher.test.ts:54,828`), matching "HEAD=7 matches" (`18-13-PLAN.md:205`).
- Keeping `realHullTable()` for the frozen worlds is correct. The acceptance harness uses it (`tests/acceptance/detectors.ts:1146`).

**Concerns**
- MEDIUM. "`budget.spec.ts` passes unedited" (`18-13-PLAN.md:29`) is vacuous for the new chunk. The only hull-chunk assertion matches `/\/assets\/ships-hulls-[^/]+\.js$/` (`tests/e2e/budget.spec.ts:326`), and `ships-static-hulls-*.js` does not match it. Nothing in the browser proves that a traffic-off start never fetches the static chunk; only the unit boot-path scan does. The plan also never measures the traffic-on first load. Production (`npm run build`, the Pages deploy) runs with traffic on, so every player now downloads a chunk of up to 300 KB at boot, and no budget records it.
- LOW. The tracer behaviour "the hit rule hits the station hull octree" (`:157`) must build a station `HitTarget` by hand, because no static is a candidate until 18-04. Say so, or the executor may start adding candidacy here.

**Suggestions.** Record the traffic-on first-load delta in `docs/PERFORMANCE.md` (`## Load size`). In the SUMMARY, state that the browser budget spec does not cover the static chunk (no browser-spec edit is allowed), so the unit scan is the only guard.

### 18-14

**Summary.** Adds `World.buoys` (offset, velocity, subentity energy): pristine-omit in the hash and the snapshot, sanitised, as an amendment of the v4 snapshot.

**Strengths**
- The anchors are exact: `StaticHealth` handling at `snapshot.ts:181/197/503-517/1156/1185`, `sanitizeStaticHealth` at `sanitize.ts:761`, `repairWorldFields` at `step.ts:278/286`, `MAX_ENTITY_VELOCITY` at `limits.ts:126`, `BUOY_MAX_ENERGY` at `limits.ts:154`, `WORLD_SNAPSHOT_VERSION = 4` at `snapshot.ts:88`.
- Storing the pose as an offset from the layout position, so that "pristine" needs no layout, is a good choice.

**Concerns**
- LOW. `depends_on: ["18-01"]` (`18-14-PLAN.md:6`) has no data dependency. Nothing in this plan reads the static artifact, so it could run in wave 1. This is harmless because wave 2 is the earliest consumer.
- LOW. The remote acceptance run at the end of Task 2 is provably a no-op: no writer exists yet, and the harness never touches buoys. AGENTS.md mandates it for `src/sim/world/**`, so keep it, but see the gate-cost note under Overall.

**Suggestions.** Drop the dependency or note why it exists.

### 18-16

**Summary.** Pure kernels: `collideWithShip` (response and damage) and the heat-free `routeScrapeDamage`, held to the 18-03 fixtures.

**Strengths**
- `routeDamage` (`src/sim/combat/shields.ts:124-163`) has exactly the facing test `!(dForward < 0)` that equals Oolite's `d_forward >= 0` (`PlayerEntity.m:5726`). Extracting it into a shared kernel is minimal and correct.
- `fast-check` is available (`package.json:40`, 4.10.2).

**Concerns**
- MEDIUM. The same `selfDestroyed` subentity quirk as 18-03 (`18-16-PLAN.md:148`). A single `dvOther` that "goes to the parent for a subentity contact" (`:154`) cannot express Oolite's `+vel2a` to the parent followed by `-vel2a` to the subentity.
- LOW. The fixture schema of 18-03 has no `destroyable` field, but `CollisionParty.destroyable` is required. The oracle consumer must set `destroyable: true` for every fixture party. State that.
- LOW. Player `takeScrapeDamage` turns a negative amount positive (`PlayerEntity.m:5710-5713`). The plan says "a non-positive or non-finite amount changes nothing" (`:179`). The kernel never produces negative damage, so this is harmless, but it is a silent divergence from the C. Note it in the doc comment.

**Suggestions.** Fix the response shape as noted under 18-03, or record the divergence.

### 18-10

**Summary.** The player's drift vector: integration, Oolite power braking, resets at pose changes, pristine-omit hashing.

**Strengths**
- Every reset site exists: `launch.ts:114`, `arrival.ts:160`, `dock/computer.ts:59`, manual capture at `dock/step.ts:174`, sanitiser at `flight/sanitize.ts:81`. `restoreFromSave` starts from `initFlightState` (`src/persistence/autosave.ts:266`), so "no persistence edit" holds.
- The braking formula matches `PlayerEntity.m:3375-3404`: `applyVelocity`, then `velmag - dt*thrust*thrust_factor`, then the cleanup term.

**Concerns**
- MEDIUM (an interaction no plan covers). The station contact response ignores drift. `respondToContact` builds the ship's velocity as `forward*speed + impulse` (`src/sim/dock/step.ts:101-102`) and writes the reflection back into `impulse` (`:121`). A player pushed toward the dock face by a collision or by a D-03 blast (68 m/s is the plan's own number) keeps its inward drift. The positional correction (`:221-224`) stops it tunnelling, but the hull branch fires a `bounce` on every tick for as long as the drift lasts (about 2 s, about 250 ticks). Each bounce is enqueued to the message line unthrottled (`src/app/session/event-router.ts`, the `bounce` case). Plan 18-11 then claims "docking is unchanged" and proves it only with a zero-drift replay. Either fold drift into `respondToContact` (reflect drift plus impulse as one velocity) or zero the inward drift component on contact, and record the choice.
- LOW. "Reaches exactly zero after 375 ticks" (`18-10-PLAN.md:163`) assumes exact decrements. With `Math.fround` on `velmag`/`velmag2`, the last tick can land at 374 or 376. Derive the stop tick from the oracle reference rather than hard-coding 375.
- LOW. `thrust_factor` is the torus factor only "while speed exceeds maxSpeed". Wegolite resets `torus.factor` to 1 on disengage (`torus.ts:188`) while the speed can still be above `maxSpeed`. Oolite keeps `hyperspeedFactor`. The effect is small; mention it as a recorded edge.

**Suggestions.** Add the drift and station-contact rule to this plan (it already edits `dock/step.ts`), with a test in which a drifting player meets the dock face.

### 18-20

**Summary.** PD-03: measures the dock-mouth decisions, the player-buoy ram and the pod and plate blockage radius on real Oolite.

**Strengths**
- The tooling claims hold. `run-remote.sh` takes `--out`, `--steps`, `--timeout`, `--addons` and `--no-build` (`tools/oolite-reference/run-remote.sh:9-10`). Entity `position`/`orientation` and ship `velocity` are writable from JS (`OOJSEntity.m:96-98, 314-327`; `OOJSShip.m:464, 1738-1742`, via `setTotalVelocity`).
- The licence handling (no OXP, log or steps file in the tree) has a mechanical acceptance criterion.

**Concerns**
- MEDIUM (the measurement as written cannot produce the 100 m/s case). Task 2 (`18-20-PLAN.md:155`) places the player 300 m from the buoy, "engines at rest", with a 100 m/s drift. Oolite brakes drift at `thrust` = 32 m/s² (`PlayerEntity.m:3387`). The stopping distance is 100²/64 ≈ 156 m, but the player must cover about 170-240 m before the hulls touch (sphere contact at 131.8 m). The player stops short. At 350 m/s it arrives at about 330 m/s, not 350. Re-apply the velocity in the frame callback until the first contact frame, start a few metres from contact, or use engine speed. Then compare against the reference evaluated at the observed closing speed, not the 100/350 fixtures.
- MEDIUM (sequencing). A MISMATCH "stops and reports" (`:23`), but no plan that consumes the measured fixtures depends on 18-20. 18-04 (dock mouth), 18-16 and 18-18 (ram) run in later waves whatever 18-20 found; only 18-12 depends on it. 18-07 also writes the D-08 FIDELITY row "with plan 18-20's measurement as its evidence" (`18-07-PLAN.md:37, 235`) without `depends_on: 18-20`. The wave order happens to hold. Make the stop gate explicit: add 18-20 to the depends_on of 18-04, 18-07 and 18-16, or state that the orchestrator halts the phase on a mismatch todo.
- LOW (over-engineering against the owner's minimum). Task 1's bracket method (a target ship placed before and after each fixture's distance, one shot per fixture, for 10 or more fixtures) is a heavy probe OXP. PD-03 mandates the measurement, so keep it, but consider measuring a representative subset (one fixture per winning part) first.

**Suggestions.** Rewrite the Task 2 setup as above, and add the explicit gate.

### 18-04

**Summary.** The station becomes a laser target through Oolite's subentity hit rule, with the dock-mouth fixtures against the port.

**Strengths**
- Grounded. The candidate block and its comments are at `src/sim/combat/step.ts:347-353, 390-430`. `firstShipHit` (`hit.ts:71-131`) is a single loop to which the subentity branch adds cleanly. `portQuaternion` is in `src/sim/dock/port-frame.ts`. `worldStepped` already exists as a parameter.
- The "HitPart beside id" `<assumption_delta_decision>` (`18-04-PLAN.md:126-131`) is a clear no-promote decision with a stated trigger.

**Concerns**
- LOW. The acceptance criterion `rg -n "Not ported: the subentity branch"` (`:240`) matches `hit.ts:17`, and 18-13 Task 1 also rewrites that paragraph (`18-13-PLAN.md:160`). After 18-13 the string may already be gone, so this criterion passes vacuously. Harmless; drop it or point it at 18-13's new wording.
- LOW. Station hits from the player make Oolite's station hostile (police and defence ships). The plan records the energy absorb (A6) but not that behavioural difference. Add a FIDELITY note in Task 3.

**Suggestions.** None blocking.

### 18-09

**Summary.** Ports `isHitByOctree` and the four-stage `doOctreesCollide` as total kernels.

**Strengths.** The scope is clean, it is held to the oracle, and the detached-subentity mask is introduced exactly where PD-01 needs it.

**Concerns.** No findings in focus. Its inputs (`HullData.subentities` from 18-13, fixtures from 18-02) are in its depends_on, and nothing calls it yet.

### 18-17

**Summary.** Integrates and brakes NPC ship drift (`Entity.velocity`) and buoy drift.

**Strengths**
- The plan correctly identifies that ship velocity is unwritten today (`src/sim/world/step.ts:132-133`), that `statsFor(table, specKey)` returns Oolite defaults for an unknown kind (`npc/stats.ts:90-102`), and that `NpcStepFacts.flight` exists (`:111-116`).
- The buoy brake (5 x 100 = 500 m/s², about 10 m from 100 m/s) is consistent with PD-02's observed numbers and `ShipEntity.m:5810-5823`.

**Concerns.** No findings in focus. One note: `debris.ts:672` uses `victim.velocity` for debris drift, so after this plan a drifting ship's debris inherits its drift. That is Oolite-faithful and only visible once something pushes a ship.

### 18-05

**Summary.** The buoys become laser targets: 250 energy, 2/s recharge, destruction, the live pose, and the tumble moved into the sim.

**Strengths**
- The shipdata values check out (`energy_recharge_rate = 2`, `max_energy = 250`), as do `ShipEntityAI.m:458-464` and the render constants at `src/render/bodies/buoy.ts:48-50`. `tests/render/buoy.test.ts:20-21, 266-270` imports the rates, so the "re-export for existing importers" instruction is necessary and correct.
- `destroyBuoy` lives in `kill.ts`, one of the files allowed to name `killer`, so the kill-credit guard stays green.

**Concerns**
- LOW. `buoyOrientation(t) = roll(Z, t*0.10) x pitch(X, t*0.15)` is a closed form of the existing render. Oolite's `BEHAVIOUR_TUMBLE` applies roll and pitch incrementally in the body frame, which is not the same rotation for t > 0. Making the hit test depend on it turns a cosmetic approximation into a fidelity one. The buoy is nearly symmetric, so the impact is small. Add a FIDELITY row.

### 18-15

**Summary.** The buoy's frangible subentity (1% bleed-through and full subentity damage, detachment) and pods and plates as laser candidates.

**Strengths**
- The bleed-through is correctly limited to lasers. `ShipEntity.m:10202-10207` and `10409-10414` are both weapon paths. Rams route full damage to the subentity with no bleed (`11123-11128`), and 18-18 implements that. CONTEXT PD-01's wording ("A laser hit or ram ... puts 0.01 * damage on the buoy body") is looser than the C, and the plans correctly follow the C.
- Fixed ids 6 and 7 avoid touching `STATIC_BODY_IDS` (`ids.ts:56-62`). `tests/sim/world/hash.test.ts:376-381` pins `LAST_RESERVED_STATIC_ID` = 99 and the five body ids, so neither changes.

**Concerns**
- LOW. Make it explicit in 18-18 that a ram on the subentity applies no 1% bleed, so that nobody "completes" PD-01's wording there. 18-18's text is already right; a one-line note prevents drift.

### 18-06

**Summary.** Ident locks the station, the buoys, pods and plates, with compiled names; the lock ends when a buoy is destroyed.

**Strengths**
- The app call sites are exact: `render-driver.ts:397` and `probe-publisher.ts:460`. `ctx.core.layout` exists (`context.ts:126`). The entity-id-scope guard only scans direct imports of `ids.ts` (`tests/guards/entity-id-scope.test.ts`), so the plan's app changes stay green.
- The existing combat spec tolerates a re-lock after the kill (`tests/e2e/combat.spec.ts:445-458`), so a static now being lockable does not break it.

**Concerns**
- LOW. With traffic off the HUD prints the raw key ("Ident system locked onto coriolis-station."), because the names load with the traffic-gated static artifact. Production has traffic on, so this is acceptable, but record it.

### 18-07

**Summary.** Live buoys block a completing jump (live pose, live mass, liveness), plus the sanctioned fixture move and a clearance sweep.

**Strengths**
- Grounded. `stationMass`/`ships?.blocks` are at `src/sim/flight/step.ts:334-352`, and `ships?: ShipField` at `:128`. The arrival safety is `witchpoint.radius + MIN_DISTANCE_TO_BUOY` with the trunc push-out (`src/sim/hyperspace/arrival.ts:124-128`), so the "at least 809.14 m" sweep is meaningful. The seams build is traffic-off (`vite.seams.config.ts`, `__WEGOLITE_TRAFFIC_DEFAULT__: "false"`) and runs only through `playwright.seams.config.ts`, so the remote command `npm run build && npm run test:e2e:seams` is runnable as written.
- The acceptance harness never sets `buoyMass` (`tests/acceptance/detectors.ts:1133-1151`), so "21 of 21 unchanged" is sound.

**Concerns**
- LOW. The D-08 FIDELITY row cites 18-20's evidence without a depends_on (see 18-20).
- LOW. `depends_on: 18-06` has no data edge. It serialises on shared files (`step-options.ts`, the app context). Fine, but it adds to a 10-wave critical path; see Overall.

### 18-08

**Summary.** Presentation (hide a destroyed buoy, draw and plot it at its live pose, hide a detached subentity) and the compass fallback.

**Strengths**
- The anchors are exact: `nextCompassMode` at `aegis.ts:66`, `cycleCompass` at `flight/step.ts:201-205`, `bodyFor`/`scannerTargets` at `hud-model.ts:78/89`, `applyFrame` at `sync.ts:96`. The buoy GLB carries the subentity as its own node (`tools/oolite-ingest/convert/glb.ts:83, 111`; `NODE_NAMES` check at `src/render/bodies/buoy.ts:210-213`), so `setSubentityVisible` is implementable.
- The compass rule matches `PlayerEntity.m:4656-4659`.

**Concerns.** No findings in focus.

### 18-11

**Summary.** The collision stage: broad phase, `doOctreesCollide`, `collideWithShip`, Oolite update-order ranking, scrape records into the ledger, and the app opt-in.

**Strengths**
- The opt-in gate (`CombatOptions.collisions`, set only by `buildStepOptions`) is the right minimum. The acceptance harness builds its own options (`detectors.ts:1137-1151`) and never sets it.
- The integration point is right. `resolveShots` (`src/sim/combat/step.ts:508-547`) runs `applyLedger` and the kill loop unconditionally, so appending collision records before `applyLedger` needs no restructuring.
- `massFor({ flight: npcFlight, masses: hyperspace.shipMasses })` matches the existing fields (`src/sim/sim.ts:116-117`).

**Concerns**
- LOW (an unlisted file will go red). Making `HitRecord.kind` required breaks typecheck in `tests/sim/combat/kill.property.test.ts:1292`, whose `fc.record` builds `HitRecord`s. That file is not in `files_modified` (`18-11-PLAN.md:7-20`). The executor will find it through typecheck. List it, or make `kind` optional with "laser" as the default.
- MEDIUM. "A manual dock with collisions on is byte-identical" (`:36`) is proven only for a zero-drift replay; see 18-10's drift and station-contact gap.
- LOW. The planned PROJECT.md row notes that a straight full-speed departure meets the nav buoy at up to 631 m/s (`:253`). That is 1,712 damage to the player and a destroyed buoy. Traffic-on browser specs that fly straight out could be affected once 18-18 adds buoys. 18-18 reruns the four traffic-on specs, so this will surface; just expect it.

### 18-18

**Summary.** Buoys join the collision stage as movers with their frangible subentity, plus cadence, cost and totality proofs and the tripwire for the player's deferred death reversal.

**Strengths**
- Correct Oolite semantics for the buoy as `self` versus `other`, and for the subentity contact (parent velocity, subentity mass and energy, no bleed), matching `ShipEntity.m:11057-11070, 11103-11106, 11123-11128`.
- The deterministic counter test (`CollisionStats`) instead of a wall-clock gate is the right cost pin.

**Concerns**
- HIGH (the tripwire guard is red, or vacuous, on day one). The guard is to fail "when `src/sim/events.ts` names `playerDestroyed`" (`18-18-PLAN.md:37, 220`). `src/sim/events.ts` already names it: the union member at `:179` (`{ kind: "playerDestroyed"; position: Vec3 }`), the doc at `:195` and the kind list at `:227`. As specified, the guard fails the moment it lands, so Task 3's `docker compose run --rm test npx vitest run tests/guards` is red. The executor then has to change the rule itself, which is exactly what a tripwire must not depend on. Key the guard on an emitter instead: a `kind: "playerDestroyed"` object pushed anywhere in `src/sim/**` outside `events.ts`, or a `"dead"` `FlightMode` (`src/sim/flight/state.ts:18` today: `"docked" | "launching" | "inFlight"`). Keep the synthetic non-vacuity case.
- HIGH (a phase-level fidelity gap this plan creates). Buoys become colliders here, but the NPC proximity pass excludes them. `src/sim/npc/proximity.ts:16-21` says "planet, sun and buoys are not candidates". In Oolite the collision region raises a proximity alert between any two ships in range (`CollisionRegion.m:308-311`), and `setProximityAlert:` ignores only others under 2,000 kg (`ShipEntity.m:6107`). A 698,691 kg buoy alerts every crewed NPC, which then avoids it. In Wegolite after 18-18, NPCs fly into buoys with no avoidance. A Krait at 100 m/s takes `dam1 = 698,691 x 100² / 5e7 ≈ 1,397` and dies, and the buoy is shoved. The acceptance harness never enables collisions, so the 20-seed run cannot see it, and the four traffic-on browser specs are unlikely to cover the beacons' neighbourhood. This needs an owner decision. Either (a) add the buoys to the proximity pass (an `src/sim/npc/**` change: an acceptance rerun with possible number changes, against the frozen-threshold rule), or (b) record it as a known divergence with a measurement of how often traffic-on worlds ram a buoy.
- LOW. `tests/sim/combat/collision-stage.test.ts`'s 18-11 byte-identical dock replay with collisions on now runs with buoys as colliders. If its approach path crosses the nav buoy (10 km out on the dock axis), it changes. The full `test` run in Task 3 will catch it. Note it as a possible re-pin with its cause.

**Suggestions.** Rewrite the guard's trigger (above). Add an owner question for the proximity gap before 18-18 executes.

### 18-19

**Summary.** The explosion blast pushes ships, buoys and the player, and every exploding body becomes a blast source.

**Strengths**
- The formula matches `ShipEntity.m:7680-7698` and `8123-8126`, with the strict `EntityInRange` (`Universe.m:5862-5868`), and the receiver radius is stated in every fixture.
- No acceptance risk. The harness passes no debris content (`detectors.ts:1137-1151`), and the blast only runs with `debrisContext`, so "21 of 21 unchanged" holds.

**Concerns**
- LOW. `dealMomentumWithinDesiredRange` pushes every `isShip && isInSpace` entity, and in Oolite the station is a ship. The plan asserts "the station never moves", which matches Wegolite's static station. Record it as a divergence, or cite the Oolite override (if `StationEntity` ignores impact moments, cite it).

### 18-12

**Summary.** Phase close: todo moves, the FIDELITY walk, the tripwire evaluation, the only `verify-full`, and the acceptance run.

**Strengths.** It depends on 18-19 and 18-20, so it is truly last. The prohibitions against editing tests or thresholds to turn a gate green are mechanical.

**Concerns.** No findings in focus. It inherits 18-18's guard problem: if 18-18 landed with a weakened guard, this plan's tripwire evaluation is the place to catch it. Add "the new guard fails on its synthetic positive case" to the evaluation.

---

### Cross-plan sequencing

- Every symbol a later wave consumes is produced in an earlier wave. I traced `SubentityHull` (18-13), `World.buoys` (18-14), `collideWithShip`/`routeScrapeDamage` (18-16), `doOctreesCollide` (18-09), `FlightState.drift` (18-10), `STATIC_TARGETS`/`buoyPosition`/`isBuoyDestroyed` (18-04/18-05), the subentity ids (18-15), `NAV_BUOY_MASS`/`ShipField.buoy` (18-07), `PLAYER_MASS_KG` (18-11) and `destroyBuoy` (18-05). The only missing edges are evidence edges on 18-20 (MEDIUM, above).
- The critical path has 10 sequential waves (18-04 → 05 → 15 → 06 → 07 → 08 → 11 → 18 → 19 → 12). Most edges are file-overlap serialisation (`combat/step.ts`, `flight/step.ts`, `render-driver.ts`), which is legitimate, but 18-06 (ident) and 18-07 (blockage) share little and could pair in one wave if the shared app files are split.

### Gate cost (owner's "necessary technical minimum")

There are about 11 remote acceptance runs (18-14, 04, 05, 15, 17, 07, 08, 11, 18, 19, 12), 6 remote `verify` runs, 7 remote Playwright runs and at least 4 Oolite reference sessions on the slow remote machine. Several acceptance runs are provably no-ops for the frozen harness. It uses `realHullTable()` (no statics), no debris content, no `collisions` and no `buoyMass` (`tests/acceptance/detectors.ts:1133-1151`). That covers 18-14, 18-04, 18-05, 18-15 and 18-08. AGENTS.md mandates the run after `src/sim/world/**` changes, so this is not a defect, but an owner-sanctioned "one acceptance run per wave" would cut about 5 runs with no loss of signal.

### Overall

**Risk assessment: MEDIUM.** The plans are unusually well grounded. Nearly every interface line, test path and anchor string checks out, and the oracle-first structure with opt-in gating protects the frozen worlds. Two findings would stop or mislead an executor:
1. The 18-18 tripwire guard keys on a symbol that already exists (`events.ts:179/227`), so the plan's own guard run goes red.
2. Phase 18 makes buoys colliders while the NPC proximity pass ignores them (`proximity.ts:16-21`, against `CollisionRegion.m:308-311`). Traffic-on NPCs will die on buoys, invisible to every gate in the phase.

The MEDIUM items are smaller. The player's drift is ignored by the station contact response (18-10/18-11). The 18-20 ram probe cannot reach contact at 100 m/s. The 18-20 mismatch stop is not a gate on the plans that consume those fixtures. The budget spec is vacuous for the new chunk, with no traffic-on load measurement. The subentity `selfDestroyed` velocity quirk is not representable in `CollisionResponse`.

**Counts:** HIGH 2, MEDIUM 7, LOW 23.

**Plans reached:** all 20 (18-01 to 18-20).

---

## Sonnet Review

## Phase 18 plan review (Sonnet): tests, oracle independence, persistence, security

Reviewer focus: tests, oracle independence, snapshot/sanitiser/hash, content artifact, tripwires, threat realism.
Scope: all 20 plans read (18-01..18-03 and 18-14 in full; 18-04..18-20 must_haves, acceptance criteria, threat models, and the tripwire/test actions). Source claims checked against the repo at HEAD (2f9eb47).

Severity count: 1 HIGH, 6 MEDIUM, 8 LOW.

### 18-01
**Summary.** Measures the Coriolis octrees and builds a second lazily loaded static-hull artifact with its own strict schema, caps, digest golden, NOTICE paragraph and Key Decisions row.
**Strengths.**
- Does not raise the ten-hull caps, which stay MAX_HULL_NODES 16,384, MAX_HULLS 16 and 200,000 bytes. The `git diff --quiet ... ships-hulls.json` gate and the grep for the three unchanged constants are real mutation guards (`src/content/schemas/ship-hull.ts`).
- Strict objects, iterative `checkHullTree`, a subentity cap, a total node cap and a refusal of non-identity subentity orientation. Zod 4.6.7 (package.json:29) rejects NaN and Infinity in `z.number()`, so the position and radius fields are finite-safe.
- Provenance: NOTICE paragraph, a note that CHECKSUMS is untouched because nothing is vendored, and a drift gate (`assets:check`).
**Concerns.**
- LOW: the caps are "measured plus 20/30 %" taken from the file the build just emitted (18-01-PLAN.md Task 2 action). That is partly self-pinned. It is acceptable only because the digest golden also pins the real node counts. Say so, so the cap is not mistaken for an independent bound.
- LOW: `StaticNameSchema` is only "non-empty" (Task 1 action), but 18-06 T-18-15 claims "the static schema bounds names (18-01)". The claim is false as written. Add `.max(64)` (or similar) to the name and key fields, or drop the claim and rely on `clampMessage` alone.
- LOW: T-18-01 is rated high. The artifact is a same-origin build output, not user input. Corruption, not attack, is the realistic threat. The severity is inflated but the mitigation is harmless.
- LOW: the traffic-gated load means `loadStaticHulls` failure behaviour is unspecified (see 18-13).
**Suggestions.** Bound name length in the schema. State in the schema doc that the caps are headroom over a golden-pinned measurement.

### 18-02
**Summary.** Independent geometry oracle: exact ray against mesh fixtures for the dock mouth and buoy, and a transliteration of `isHitByOctree` and `doOctreesCollide` with a brute-force soundness check.
**Strengths.**
- Genuinely independent route for the rays. Expected answers come from exact Moller-Trumbore over the vendored `.dat` meshes, not from the port's octrees. The oracle can therefore catch a wrong octree build as well as a wrong rule.
- The guard (`tests/guards/oracle-independence.test.ts`) refuses non-oracle relative imports, bare packages other than zod and vitest, and literal `src` path segments in fs/path calls. Reading `third_party/oolite/Models/*.dat` passes it (no `src` segment), which is intended.
- The brute-force overlap soundness loop stops the reference inventing contacts. The pruned-corner fixture pins Oolite's crude-prune behaviour, which a "clean" geometry port would get wrong.
- The plan does not quote any port number in its fixture instructions.
**Concerns.**
- MEDIUM: the dock-mouth tolerance is the winner's leaf half-diagonal "by Oolite's depth rule", and the plan admits that rule may not be derivable and falls back to "a conservative bound" (Task 1 action). A conservative bound shrinks the number of rays that pass the "margin >= 2 x tolerance" filter. The acceptance floor is only >= 10 fixtures with at least one dock win and one faceplate win. The set could degenerate to easy rays that every plausible port passes. Require a minimum of dock-slot-edge and faceplate-edge cases, and have the SUMMARY list the tolerance per fixture.
- MEDIUM: the "executor reads no Wegolite code" rule is a process rule that no mechanical check can verify. The guard is mechanical but cannot see a path assembled at run time (its own header says so). The same model family transliterates the same C as the port author, so the oracle has common-mode risk. 18-20 (real Oolite measurement) is the only real counter. This is a good design, but 18-20 has no explicit link to the octree-collide fixtures, only the dock-mouth ones.
- LOW: the "ids unique across every oracle tree" claim relies on the existing check in `tests/oracles/npc/reference.self.test.ts:97`. Confirm it scans `tests/oracles/combat/**` as well, or add a combat-tree uniqueness case.
**Suggestions.** Add a floor on edge-adjacent dock rays. Add an 18-20 probe for one octree-collide pair (for example two pods), because that is the only geometry the real engine can confirm for collisions.

### 18-03
**Summary.** Independent response oracle: `collideWithShip`, player and ship braking, the player's scrape, and the blast push, each with a derived fixture.
**Strengths.**
- Derivations are cited by C line. A negative grep forbids the wrong half (`takeEnergyDamage`, `canScoop`). One fixture per branch. float32 locals are named (`Math.fround`).
- It cross-checks against CONTEXT figures afterwards, in the SUMMARY only.
**Concerns.**
- MEDIUM: the independence claim is undermined by the plan text itself. The truths say "the figures quoted in CONTEXT and 18-RESEARCH are never used as an expected value" and the objective says "derive, never copy". Yet the Task 2 `<behavior>` hands the oracle author the answers: "about 68.1 m/s", "about 0.027 m/s", "about 0.0007 m/s", "about 0.06 m/s", "about 18.1 m/s", "about 1.3 m/s", "about 0.013 m/s", "d2 = 64 - 5.7986^2 = 30.38", and the Task 1 "241.3 m/s" ram. The oracle author reads this file, so the "derived" blast fixtures are anchored by the planner's numbers. Strip the numeric answers from the behaviour list and keep only the configurations. Do the figure cross-check in a different agent or in the SUMMARY.
- LOW: both an unenforceable process rule and the same-author transliteration risk remain. 18-20 covers the player-buoy ram only. A real-Oolite check of a ship-ship ram (mass asymmetry, the inelastic reversal) is absent from PD-03.
**Suggestions.** Remove expected numbers from the plan. Extend PD-03 to one ship-ship ram.

### 18-04
**Summary.** Station becomes a laser target through the subentity rule; the dock-mouth fixtures drive the port.
**Strengths.**
- `tests/sim/combat/dock-mouth.oracle.test.ts` reads the 18-02 JSON, so the criterion-2 proof is an external oracle, not a pinned value.
- "A failing fixture is a dispute, never a widened tolerance" is the correct discipline.
- The station's hash-equality case after 1,000 hits (T-18-09) is a real test that the station branch writes nothing.
- Candidacy is gated on the hull key being in the table, which keeps the frozen acceptance worlds on `realHullTable()` unchanged.
**Concerns.**
- MEDIUM: the "remote acceptance 21 of 21, unchanged numbers" check is repeated in 18-04 to 18-19 as evidence. The acceptance harness uses `realHullTable()` (no statics) and never sets `CombatOptions.collisions`, as 18-04 and 18-11 themselves say. By construction it cannot see any new path. It only proves the frozen worlds are untouched, which is useful, but it is not evidence that the new behaviour is deterministic or correct. State that distinction, and rely on the cadence and property tests for the new paths.
- LOW: the app twins (`fullHullTable`) are updated "with any value that moves re-pinned". Re-pinning needs a recorded cause, which the plan has. The pin diff-gate covers only `tests/acceptance`, `tests/e2e` and `tests/golden/world`, not the twin pins.
**Suggestions.** Reword the acceptance bullets as "frozen worlds untouched" and do not cite them for the new behaviour.

### 18-05
**Summary.** Buoy health, recharge, destruction, live pose and the render orientation pin.
**Strengths.**
- T-18-11/12 cases: NaN, Infinity, zero and negative amounts; a 10,000-tick no-revival case; one destruction for two lethal records in a tick. These tests fail if the behaviour is wrong.
- Pins the drawn orientation to the sim's `buoyOrientation` (PITFALLS 11).
**Concerns.**
- LOW: the "this plan leaves snapshot.ts alone" acceptance uses `PLAN_BASE..HEAD`, where PLAN_BASE is "recorded in the SUMMARY at the plan's start". The base is not defined anywhere the executor can rely on. Replace it with a fixed commit (as other criteria use `76229f5`) or a `git diff --quiet <sha> -- file` check.
**Suggestions.** Use a fixed SHA.

### 18-06
**Summary.** Ident locks the station, buoys, pods and plates. Wrecks and subentities are excluded.
**Strengths.** The lock ends on the destruction tick (`identLost`), the order is ascending id with strict `<`, and the plan checks the tripwire todo on player-lock self-targeting and states why it is not triggered. A grep forbids display names typed into app code.
**Concerns.** LOW: T-18-15 assumes the schema bounds names (see 18-01). No other findings in focus.
**Suggestions.** Align with the 18-01 name-length fix.

### 18-07
**Summary.** Buoys block a completing jump by Oolite's mass rule. The D-06 e2e fixture pose moves.
**Strengths.**
- The 2,048-layout clearance sweep is a real property test of "no arrival or launch pose overlaps a buoy". It addresses T-18-17 (a jump that can never complete).
- The one sanctioned browser-spec edit is diff-gated by exact path.
- The rule that `buoyMass` must be finite and positive, with NaN and -1 cases, covers T-18-16.
**Concerns.**
- LOW: the pose [1000,0,0] is justified for Lave only. The spec parks the player at one system, so that is fine, but state that the clearance test is the generality check.
**Suggestions.** None beyond that.

### 18-08
**Summary.** Destroyed buoy leaves the view, scanner and compass. Subentity mesh hidden.
**Strengths.** Persistence is explicitly diff-gated (`git diff --quiet ... src/persistence tests/e2e/save-load.spec.ts`). The compass fallback is tested through `stepFlight`. A "Compass cycle model" FIDELITY row is added with a citation.
**Concerns.** No findings in focus. LOW: the render and scanner behaviour is only unit-tested (`applyBuoyState`); there is no browser assertion (see Overall).
**Suggestions.** None.

### 18-09
**Summary.** Port of `isHitByOctree` and `doOctreesCollide`.
**Strengths.**
- Passes every 18-02 octree fixture and cross-checks the port against `isHitByOctreeReference` on random depth-2 trees. This is a real independent oracle use. Test code importing the oracle is allowed because the guard restricts only the oracle tree's own imports.
- Totality and recursion bound (`MAX_OCTREE_DEPTH`) with malformed-node cases (T-18-20). Includes a "bounding spheres overlap but octrees do not" case with the real hulls (no sphere-only contact).
**Concerns.** LOW: a mutation-style acceptance grep forbids `try {` in `collide.ts`. Comment text containing it would trip it; the other plans' greps are comment-stripped (`rg -v`) but this one is not. Make it consistent.
**Suggestions.** Use the comment-stripped form.

### 18-10
**Summary.** Player drift vector with Oolite's braking, zeroed at every pose install.
**Strengths.** Pristine-omit is tested by the flight-hash pins and `tests/golden/world` diff gate. A grep forbids `thrustAccel` in `drift.ts` (guards the "5 x thrust" mistake). Tests against the 18-03 braking fixtures. Saves are diff-gated, since drift is never persisted.
**Concerns.** LOW: drift is "zeroed wherever a pose is installed" over a list of four sites plus init. A missed pose-reset site (for example a future teleport path) would leak drift across a dock. A test that enumerates every writer of `FlightState.position` would be stronger than four greps.
**Suggestions.** Optional guard that every position-reset site also resets drift.

### 18-11
**Summary.** Collision stage: once-per-pair, update-order ranking, opt-in flag, shield routing, kill path.
**Strengths.**
- The 600-tick "damages once, then never again" case directly tests PITFALLS 9.
- The stage is opt-in (`CombatOptions.collisions === true`), so frozen worlds stay byte-identical. Byte-identical dock with collisions on and off tests DOCK-09.
- `sourcePosition` copied at queue time (Phase 15 carry-over). Four tripwire todos are evaluated with a reason each.
**Concerns.**
- MEDIUM: the mutual-kill tripwire (2026-11-18-mutual-kill-credit-symmetry) is declared "not triggered: nothing reads credits". A collision where both parties die in one tick is exactly the same-tick mutual kill whose asymmetry that todo records, and collisions make it routine rather than rare. The plan says "the credited source is the other party" for each victim, while `killShip` today credits asymmetrically. Reconcile: either collision kills use the existing rule (and the plan says so) or a new rule is introduced (and the todo must be updated in the same commit). Test the both-die case explicitly.
- LOW: the acceptance-evidence caveat (see 18-04) applies here too.
**Suggestions.** Add a both-lethal ram case and state the credit outcome.

### 18-12
**Summary.** Phase close: todos, FIDELITY walk, the only `verify-full`.
**Strengths.** Gate and acceptance diff-gating (`tests/acceptance` unchanged). Tripwires re-evaluated at close with reasons.
**Concerns.**
- LOW: PD-04 defers `verify-full` to the end although plans 18-08 (render), 18-13 (app boot and hull load) and 18-14 (hash and snapshot) touch the areas AGENTS.md says require `verify-full`. It is an owner decision (PD-04), so only note that a late `verify-full` failure then has twelve plans of blame to bisect. Consider one mid-phase `verify-full` after 18-14.
**Suggestions.** Optional mid-phase `verify-full`.

### 18-13
**Summary.** Loads static hulls in traffic-on sessions and merges into the hull table. Twins move to `fullHullTable`.
**Strengths.** Boot-path scan (`loadStaticHulls` only inside the traffic-gated branch, never named under `src/sim`); `budget.spec.ts` unedited; an equality case pinning app and twin table construction (T-18-37).
**Concerns.**
- MEDIUM: nothing exercises the real browser load. With traffic off (the e2e build default) statics are never loaded, and none of the unedited traffic-on specs shoots, locks or rams a static. A broken `import.meta.glob`/`?raw` path in the production bundle, or a rejected schema parse, would leave the game running with no statics and no test failing. The plan also does not say what the session does when `loadStaticHulls()` rejects (fail boot, or silently continue without statics). Specify the failure behaviour and add at least a traffic-on probe or e2e assertion that the loaded table contains `coriolis-station`.
**Suggestions.** Add a probe field or a tiny traffic-on spec for "statics loaded". Define the reject path.

### 18-14
**Summary.** Per-world buoy state (offset, velocity, subentity energy): hash line, snapshot key, bounds, sanitiser, Key Decisions amendment.
**Strengths.**
- Pristine-omit follows the proven `staticHealth` pattern (`src/sim/world/serialize.ts:174-181,228-250`, `sanitize.ts:753-790`, `snapshot.ts:503-517,1156-1221`). Hash and snapshot print nothing for a pristine world, so every pin and golden is unchanged. The `git diff --quiet ... tests/golden/world` gate and the `WORLD_SNAPSHOT_VERSION = 4` grep are effective guards.
- Parser rejects non-finite, over-bound and unknown keys with the path named. The sanitiser repairs before every hash (wired next to `sanitizeStaticHealth` in `repairWorldFields`, `src/sim/world/step.ts:278-290`). Bounds are in `limits.ts` only. `MAX_BUOY_OFFSET = 1e6` is derived (brake 5 x 100 m/s^2, 1e5 m max travel, 10x margin) and `MAX_ENTITY_VELOCITY = 1e4` already exists (`limits.ts:126`).
- The threat model is honest: it names the `?test=1` hook and tests as the only snapshot source, and saves never carry world state.
**Concerns.**
- MEDIUM: PROJECT.md Key Decisions row 298 states the v4 field set is final ("Phases 16 to 20 add no further field or bump"). The plan amends it on owner authority (PD-01/PD-02), which is correct, but the amendment is recorded only in Task 2's last step. If Task 1 lands first, there is a commit where the hashed field exists but the decision row still says it does not. Put the PROJECT.md edit in Task 1's commit ("same commit as the rule", AGENTS.md).
- LOW: the sanitiser heals a non-finite `subentityEnergy` to 200, which would revive a detached subentity from corrupt input. The existing `staticHealth` repair does the same (heals to max, `sanitize.ts:~775`), so it is consistent, but a detached buoy sub should arguably heal to 0 when non-finite. Decide and record it.
- LOW: the sanitiser only runs inside `stepWorld`. A hash taken straight after `restoreWorld` relies on the parser's rejection, which the plan does cover.
- LOW: a buoy that stops at a nonzero offset never returns to pristine, so such a world carries a `buoys:` line for the rest of its life. That is correct but the tests should include "moved then rested" hashing stably across 30/60/144 Hz (18-17 and 18-18 cover it).
**Suggestions.** Move the Key Decisions amendment into Task 1. Record the non-finite-energy heal direction.

### 18-15
**Summary.** Frangible buoy subentity: the 1 % bleed-through, tracked subentity energy, detachment, pods and plates as laser targets.
**Strengths.** T-18-41 cases (energy in [0,200], no revival after detachment, 10,000 ticks). Wrecks forbidden by a grep and test. Static ids 6 and 7 stay in `ids.ts` and the entity-id-scope guard runs.
**Concerns.** LOW: the plan says "subentity recharges 1/s while above 0 and below 200". A hit that takes it to exactly 0 detaches it. A hit that leaves 0 < e < 200 means a world with a perpetually changing `buoys:` hash line until it is back at 200. That is deterministic, but the 30/60/144 Hz equality test should cover a mid-recharge snapshot. No other findings.
**Suggestions.** Add a mid-recharge equality case.

### 18-16
**Summary.** Pure `collideWithShip` kernel and `routeScrapeDamage`.
**Strengths.** Fixture-driven against 18-03. fast-check over NaN, Infinity and 1e308 for totality. `routeDamage` banned in the kernel by a negative grep, with fixtures asserting no heat.
**Concerns.** LOW: the grep gates (`killer|shipHit|routeDamage|try \{|Math.random`) are not comment-stripped, so a docstring mentioning "routeDamage" or "killer" fails the criterion. Use the `rg -v` comment-stripped form used elsewhere.
**Suggestions.** Same.

### 18-17
**Summary.** NPC ship drift integration and buoy braking.
**Strengths.** `braking-npc.json` oracle fixtures, 30/60/144 Hz cases for a drifting Krait and buoy, and a world golden diff gate.
**Concerns.** No findings in focus. The pristine-omit claim for ships rests on `Entity.velocity` already being a hashed v4 field; zero velocity writing nothing is tested.
**Suggestions.** None.

### 18-18
**Summary.** Buoy colliders, cost counter, property tests, and the player-death tripwire guard and todo.
**Strengths.** The deterministic `CollisionStats` counter test at 256 entities beats a wall-clock bound. fast-check over generated worlds with buoys. `colliderRank` is a total order (distance then id).
**Concerns.**
- HIGH: the tripwire guard as specified cannot work. The plan (18-18-PLAN.md Task 3 action, line ~220) says: fail when `src/sim/events.ts` names `playerDestroyed` or `FlightMode` includes `"dead"`, while `collide.ts` still contains `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20`; "pass with neither present". But `playerDestroyed` is already a declared, reserved event kind in `src/sim/events.ts:179` and `:227` (and used in `tests/sim/world/step.test.ts:1058`, `tests/app/session-order.test.ts:1175`). The guard would therefore fail the moment it is created, and the acceptance line "pass with neither present" can never hold. An executor will either weaken the guard until it passes (turning the tripwire into a no-op) or stop. Rewrite the trigger around a producer, not a declaration: for example a `kind: "playerDestroyed"` literal pushed anywhere under `src/sim` outside `events.ts`, a `"dead"` member of `FlightMode` (`src/sim/flight/state.ts:18`), or a call to a player-death function. The synthetic-source case must then prove the new rule still matches.
- MEDIUM: the todo is created in the same plan as the guard; the AGENTS.md/memory rule is "deferred fix = todo + guard that fails on first consumer". The first consumer of the "reversal never taken for the player" gap is Phase 20's death path, so the producer-based trigger above is the right "first consumer".
- LOW: cost evidence is a counter (good) plus an informational wall-clock figure in `docs/PERFORMANCE.md`; fine.
**Suggestions.** Fix the trigger before execution. Keep the synthetic cases for both the producer rule and the `"dead"` mode rule.

### 18-19
**Summary.** Explosion blast pushes ships, buoys and the player (D-03).
**Strengths.** Every blast fixture of 18-03 drives the port. Clamp at `MAX_ENTITY_VELOCITY` at every write for the 0.1 floor (T-18-31). A station-in-range test (the station is never a receiver). Flight pins diff-gated with every re-pin carrying its cause.
**Concerns.**
- MEDIUM: the plan's must_haves repeat the exact numbers that 18-03 should have derived (68.1, 0.027, 0.0007, 0.06, 18.1, 1.3, 0.013 m/s). If the oracle author saw them (see 18-03) the "independent" blast fixtures and the port truth are the same planner numbers. The oracle must stay clean of them.
- LOW: "a pin that moves because a ship, buoy or the player was in range is re-pinned with its cause" is a weak spot for a fidelity-sensitive change. Prefer that no existing pin moves, and make a moved pin a stop-and-ask.
**Suggestions.** See 18-03.

### 18-20
**Summary.** PD-03: measure dock-mouth, buoy ram and pod/plate blockage on real Oolite via the reference container.
**Strengths.** The correct counter to common-mode oracle error. A mismatch never edits a fixture, tolerance or port (diff-gated via `git log PLAN_BASE..HEAD -- tests/oracles src`), and it creates a todo. No Oolite output in the tree (porcelain check for `.oxp`, logs, png, steps; CC BY-NC-SA hygiene). "Unobservable" is recorded, not passed.
**Concerns.**
- LOW: `PLAN_BASE` is again "recorded in the SUMMARY when the plan started", with no mechanism. The `git log` gate is only meaningful if the base is a real SHA.
- LOW: scope does not cover octree-collide fixtures or a ship-ship ram (see 18-02, 18-03).
**Suggestions.** Use a fixed SHA. Add one ship-ship ram.

### Cross-plan comparison

- Wave order is sound for the oracle: 18-02/18-03 (wave 1) before any port, 18-20 (wave 2) before the ports that consume its fixtures (waves 3+), and a mismatch stops before port work.
- Hash/snapshot discipline: only 18-10, 18-14 and 18-17 add hashed state, and each uses pristine-omit with a golden diff gate. This is the strongest part of the phase.
- The recurring "remote acceptance 21 of 21 unchanged" bullet is a frozen-worlds regression check, not new-behaviour evidence. It appears in 11 plans.
- No plan adds a browser test for the headline criteria (laser stops at station, ident, ram). All existing specs are "passes unedited". The statics are not loaded in the traffic-off e2e bundle at all.
- Greps used as "mutation guards" are inconsistently comment-stripped across plans (18-09, 18-16 are not).

### Overall

**Risk Assessment: MEDIUM.**

The persistence and content design is careful: pristine-omit, strict bounded schemas, diff-gated goldens, honest threat models for a static client (the only untrusted-input path is the `?test=1` snapshot hook, correctly named in 18-14). The oracle architecture is sound and has a real-Oolite backstop in 18-20. Three things need fixing before execution:

1. HIGH, 18-18: the player-death tripwire triggers on `playerDestroyed`, which already exists in `src/sim/events.ts:179,227`. The guard cannot pass as specified.
2. MEDIUM, 18-03/18-19: expected blast and ram numbers are written into the plan text the independent oracle author reads, defeating the "derive, do not copy" rule.
3. MEDIUM, 18-13 plus phase level: no browser-level evidence that statics load and work in the production-like build, and the 21/21 acceptance run is cited as evidence for paths it cannot execute.

Other MEDIUM items: dock-mouth tolerance and margin rules could degrade to easy rays (18-02); mutual-kill credit asymmetry becomes routine with collisions and is declared "not triggered" (18-11); the Key Decisions amendment should ship in the same commit as the hashed field (18-14).

---

