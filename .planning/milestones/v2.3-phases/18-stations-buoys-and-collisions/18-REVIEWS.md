---
phase: 18
round: 2
reviewers: [fable, opus, sonnet]
reviewed_at: 2026-11-19T17:04:57Z
plans_reviewed: [18-01-PLAN.md, 18-02-PLAN.md, 18-03-PLAN.md, 18-04-PLAN.md, 18-05-PLAN.md, 18-06-PLAN.md, 18-07-PLAN.md, 18-08-PLAN.md, 18-09-PLAN.md, 18-10-PLAN.md, 18-11-PLAN.md, 18-12-PLAN.md, 18-13-PLAN.md, 18-14-PLAN.md, 18-15-PLAN.md, 18-16-PLAN.md, 18-17-PLAN.md, 18-18-PLAN.md, 18-19-PLAN.md, 18-20-PLAN.md, 18-21-PLAN.md, 18-22-PLAN.md]
models:
  fable: "fable"
  opus: "opus"
  sonnet: "sonnet"
model_sources:
  fable: "agent-alias"
  opus: "agent-alias"
  sonnet: "agent-alias"
previous_round: "b45e113"
---

# Cross-AI Plan Review — Phase 18 (round 2)

Round 2 over the 22 replanned plans at commit `8f33318`, by three independent Claude subagents (own models, per the owner's rule): Fable — Oolite fidelity and determinism; Opus — executability, sequencing, grounding; Sonnet — tests, oracle independence, persistence, security. Reviewers were told to verify the round-1 dispositions (each plan's Review Dispositions Ledger) and look for new problems. Round 1 is in git at `b45e113` (the ledgers cite its line numbers as `L##@b45e113`).

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Consensus Summary

Overall risk: MEDIUM (all three). Counts: Fable 0 H / 5 M / 13 L; Opus 1 H / 4 M / 13 L; Sonnet 0 H / 7 M / 9 L. The round-1 dispositions traced by the reviewers (prime role, sticky routing, frangible split, split dvOther, drift branch, ram-probe arithmetic, 18-20 gating) are present in executable task text; no path found that breaks 30/60/144 Hz equality or pristine-omit hashes; waves and dependencies match the data flow.

### Agreed Concerns (2+ reviewers)
1. **18-20 real-Oolite probes can produce a false verdict, and a false MISMATCH stops four plans** (Opus HIGH, Fable MEDIUM).
   - Shooting the main station in real Oolite marks the player an offender and launches police through the very dock slot the rays cross (`StationEntity.m:1128-1141`).
   - The probe ignores the laser's offset from the ship centre and the station's spin (Opus).
   - The pod/plate blockage probe likely measures nothing: a pod that close sits inside the Cobra's hull (Opus).
   - The ram probe does not log subentity energy, so a hull contact cannot be told from a subentity contact (m2 differs ~91-fold) (Fable).
   - 18-17 consumes the measured buoy displacement but sits outside the 18-20 gate (Fable).
2. **18-18 player-death tripwire still too narrow** (Sonnet, Opus): it skips `events.ts` and matches only a literal `kind: "playerDestroyed"` or a `"dead"` FlightMode, so a Phase 20 factory function or a differently named mode would pass unnoticed.
3. **18-21 / PD-06–PD-07 side effects** (Fable, Opus).
   - Fable: the proximity port omits Oolite's 2r-extent collision-chain prefilter (`Universe.m:6713-6780`). Phase 14's "no-op for equal radii" justification does not hold for buoys: Wegolite would alert at 236.6 m where Oolite alerts at 164–219 m, and PD-07 would then accept those moved numbers as "more faithful".
   - Opus: there is no rule for unit-test pins that move because NPCs now avoid buoys (PD-07 covers only the acceptance run), and "an NPC never touches the buoy" is stronger than Oolite guarantees.

### Single-reviewer findings worth acting on
- **Sonnet MEDIUM, 18-14:** `hashWorld` repairs `staticHealth` itself (`src/sim/world/serialize.ts:243-247`) because the probe and the acceptance detectors hash without stepping. The new `World.buoys` is sanitised only in `repairWorldFields`, and `canon` throws on non-finite values (`src/sim/hash.ts:30`).
- **Sonnet MEDIUM, 18-02 → 18-04/18-20:**
  - the dock-mouth tolerance (leaf half-diagonal) does not bound oblique rays;
  - "none" fixtures have no clearance rule, so a correct port can fail a fixture, and "never widen the tolerance" then stops the phase;
  - the prime-role fixtures must each flip individually, and the soundness property only runs one way.
- **Sonnet MEDIUM, 18-02/18-09:** Oolite's `doOctreesCollide` recurses (`ShipEntity.m:1899-1938`), so its stage 4 can never fire; the specified subentity-against-subentity result contradicts the C.
- **Sonnet MEDIUM:**
  - 18-03's behaviour list still contains expected figures, which contradicts its ledger;
  - 18-13's load-failure test is only a source scan.
- **Fable MEDIUM, 18-19:** a gate pins a false citation into FIDELITY. `isInSpace` does include `STATUS_ACTIVE` (`Entity.m:1043`); the station is pushed and braked to rest within the frame. (This was Fable's own round-1 error, which the plan copied.)
- **Fable MEDIUM, 18-11:** the deferral of a populated-world run with collisions on does not hold.
- **LOW items** (labels and float32 constants): 18-07's 396.1 m label; 18-08's node name; a detached buoy mass that should be the float32 value 691,044.375.

---

## Fable Review

## Phase 18 plan review, round 2 — Oolite fidelity and determinism (fable)

Focus: every ported rule against the Oolite C, and anything that breaks 30/60/144 Hz equality or pristine-omit hashes. Read-only; nothing was run. Plan paths are relative to `.planning/phases/18-stations-buoys-and-collisions/`. Oolite paths are relative to `/home/opencode/git/oolite/src/Core/` (the cited files are unchanged between pin `7437f22` and the checkout HEAD `21978c37b`; `git diff --stat` is empty for them).

Severity totals: **0 HIGH, 5 MEDIUM, 13 LOW**.

One of the MEDIUM findings (18-19) is my own round-1 error, copied faithfully into the plan. It is called out as such.

Round-1 dispositions I checked against the C and the plan tasks and found correct and complete:

- **Prime role of `isHitByOctree`** (18-02, 18-09): the axial tree is the receiver (`Octree.m:473-477`, `ShipEntity.m:1897`), the radius compare only picks the prune (`Octree.m:497-512`), decomposition depends on solidity (`:519-594`). Truths, behaviour, action and gates all say so now (`18-02-PLAN.md:29`, `:192-193`, `:215`; `18-09-PLAN.md:144`, `:168`).
- **Sticky `subEntityTakingDamage`** (18-14, 18-15): the only setter with a non-nil value is `Universe.m:5634-5636`; the only clears are dealloc (`ShipEntity.m:1041`), the dead-reference getter (`:1245-1247`) and `subEntityDied` / `subEntityReallyDied` (`:8187-8188`, `:8199-8200`); both firing paths read the flag, not the current hit (`:10202-10209`, `:10409-10416`). The plan sets on a subentity win, routes every later laser hit while set, and clears at detachment (`18-15-PLAN.md:32`, `:172`). The flag is pristine-omit, parsed, bounded and repaired (`18-14-PLAN.md` truths 1 and 4).
- **Frangible 1 % / 100 %**: `0.01 * weapon_damage` on the parent, then the full amount on the subentity, gated on the parent's `isFrangible` (default YES, `ShipEntity.m:376`; Coriolis `frangible = 0`). A ram has no bleed (`ShipEntity.m:11123-11128`), and 18-18 says so in executable text (`18-18-PLAN.md:169`).
- **Split `dvOtherBody` / `dvOtherSubentity`** (18-03, 18-16, 18-18): `[otherParent adjustVelocity:vel2a]` (`ShipEntity.m:11103-11105`) and the selfDestroyed reversal `[other adjustVelocity:-vel2a]` on the subentity itself (`:11117-11119`). The schema, the fixture `collide-subentity-self-destroyed`, the kernel type and the stage all agree.
- **Station-contact drift branch** (18-10): traced through `src/sim/dock/step.ts:93-124`. With drift 68 m/s inward and the engine part zero, the engine part gets the `MIN_OUTWARD_SPEED` floor (8 m/s outward), the drift reflects to 34 m/s outward, and the next tick separates: one bounce. The `drift !== 0` guard keeps the zero-drift path byte-identical. Everything runs inside the fixed step.
- **Blast two sources for a dying buoy** (18-03, 18-19): subentities explode first (`ShipEntity.m:8115-8120`), `subEntityDied` lowers the mass (`:8185-8194`), then `0.125f * mass` (`:8123-8126`).
- **Jump blockage with live mass and pose** (18-07): `k * [ship mass] > d2 && d2 < SCANNER_MAX_RANGE2` (`ShipEntity.m:12526-12527`), mass reduced by `subEntityDied`.
- **Compass fallback** (18-08): `PlayerEntity.m:4655-4659`.
- **100 m/s ram probe** (18-20): 150 m start, 156 m stopping distance, contact at or inside 131.8 m. Reaches contact.

---

### 18-01

**Summary.** Static hull artifact with subentities and `frangible` per hull.

**Strengths.** `frangible` comes from data (`shipdata.plist` Coriolis `frangible = 0`; buoy default YES, `ShipEntity.m:376`), which is what gates the sticky 1 % routing in 18-15.

**Concerns.** No findings in focus. The buoy subentity position `(0, 0, 0)` (`Resources/Config/shipdata.plist:1045-1048`) is carried, which several later rules silently depend on (see 18-19, LOW).

**Suggestions.** None.

### 18-02

**Summary.** Independent geometry oracle: dock-mouth rays and a transliteration of `isHitByOctree` / `doOctreesCollide`.

**Strengths.** The round-1 HIGH is fixed in truths, behaviour, action and a negative grep, with a self-test variant that must fail (`18-02-PLAN.md:192-193`, `:215`).

**Concerns.**

- **LOW — the oracle is told a return value the C never produces, and the port plan repeats it (same defect class as round 1's HIGH, but unreachable in this phase).** `18-02-PLAN.md:194` says the reference returns "the other subentity's index for subentity-subentity", and `18-09-PLAN.md:25` and `:144` say "the four stages in order". In the C, stage 2 is recursive: `doOctreesCollide((ShipEntity*)se, other)` (`ShipEntity.m:1903-1906`) is called with the full `other`, so inside it stage 3 tests the prime subentity's hull against every one of `other`'s subentities (`:1911-1918`) and returns non-nil; the outer call then returns `other`, the hull. A subentity-against-subentity contact therefore returns `other` at stage 2, and stage 4 (`:1921-1935`) is dead code. Both parties need subentities for this to matter, which today means buoy against buoy (unreachable, 223 km apart) because the station is not a collider. It becomes reachable the day a station type or a ship with subentities joins the stage.

**Suggestions.** Change the expected result of the subentity-subentity fixture to `"other"` with the recursion cited, or mark the fixture "not the C's result, unreachable in Phase 18" and add a tripwire. A literal recursive transliteration gives the right answer for free.

### 18-03

**Summary.** Independent response oracle: `collideWithShip`, braking, scrape, blast.

**Strengths.** Float handling now follows the C: `m2 * v2b * v2b / 50000000` is a float expression widened on assignment, `magnitude2(v)` is a float compared with the double `0.1`, `energy` is `GLfloat` (`Entity.h:134`). Expected figures are gone from the text. The "receiver at the victim's centre is skipped" fixture matches the C: `vector_normal` of a zero vector is `kZeroVector` (`OOVector.h:247-253`, `:270-273`).

**Concerns.** No new findings in focus.

**Suggestions.** None.

### 18-04

**Summary.** The Coriolis as a laser target through the subentity rule.

**Strengths.** Loop order and tie rule match `ShipEntity.m:1332-1356`. Now gated on 18-20.

**Concerns.** No findings in focus. The station also receives Oolite's sticky flag (`Universe.m:5634-5636`), which is inert because the Coriolis is not frangible; the plan's "one full record on the station" is right.

**Suggestions.** None.

### 18-05

**Summary.** Buoy health, recharge, destruction, live pose.

**Strengths.** `n_alloys` divisor and the tumble divergence row are corrected. `buoyOrientation(flightTime)` reads a fixed-step, hashed clock (`src/sim/flight/step.ts:399`, `src/sim/flight/state.ts:169`), so the pose is identical at 30/60/144 Hz.

**Concerns.** No findings in focus.

**Suggestions.** None.

### 18-06

**Summary.** Ident over statics, pods and plates.

**Concerns.** No findings in focus; matches `Universe.m:5689-5706` (`canCollide`, not `CLASS_NO_DRAW`, strict `<`, collision radius cross-section).

### 18-07

**Summary.** Live buoys block a completing jump with live pose and mass.

**Strengths.** Rule and strictness match `ShipEntity.m:12526-12527`; the field is read from the previous tick's world.

**Concerns.**

- **LOW — one more reader of the buoys' layout position is not on anybody's list.** PD-02 says "scanner, beacon/compass, render and jump blockage read the live pose" and D-05 lists what a destroyed buoy stops doing. The torus factor is missing from both: `nearestSurfaceDistance` (`src/sim/flight/torus.ts:53-71`, used at `:160` and `:252`) takes `layout.navBuoy` and `layout.witchpoint` as surfaces. In Oolite the nearest surface is the nearest live collidable entity (`PlayerEntity.m:2917-2924`), so a destroyed buoy no longer holds the factor at 32 and a moved buoy counts where it is. After this phase a destroyed witchpoint beacon still caps the torus factor within 102.4 km of where it was. No plan mentions it (`rg -n "nearestSurface|torus\.ts" 18-*-PLAN.md` finds nothing). Deterministic (the layout is static), so no hash risk.

**Suggestions.** Either pass `ShipField.buoy(key)` (this plan adds it; `torus.ts` already imports `ShipField`) so a dead buoy is skipped and the offset is added, or add a FIDELITY row. Guarded on "world present and buoy not pristine", it changes no existing pin.

### 18-08

**Summary.** Presentation of a destroyed, moved or stripped buoy; compass fallback.

**Concerns.** No findings in focus. The compass rule matches `PlayerEntity.m:4655-4659`, and the cycle divergence has its row.

### 18-09

**Summary.** `isHitByOctree` and `doOctreesCollide` as pure kernels.

**Strengths.** The axial rule is now stated correctly and both prime-role fixtures must pass.

**Concerns.**

- **LOW — the dead stage 4** (see 18-02; counted once there).
- **LOW — a stale sentence survives in a file executors are sent to.** `18-RESEARCH.md:290` still says "it picks the 'axial' octree by radius, so always call it with `prime` = the lower id". Both halves are superseded (the axial rule by this plan, "lower id" by 18-11's rank rule), and RESEARCH is in the phase's read-first list.

**Suggestions.** Strike or annotate `18-RESEARCH.md:290`.

### 18-10

**Summary.** `FlightState.drift`, integrate-then-brake with raw thrust, and the new station-contact drift branch.

**Strengths.** Order and factor match `PlayerEntity.m:3376-3404`. The drift branch works as specified (traced above) and is guarded so the zero-drift dock path is byte-identical. The float32 underflow is closed.

**Concerns.**

- **LOW — a hashed field and a new contact rule land with no decision row.** The plan's file list has no `PROJECT.md`, `FIDELITY.md` or `CHANGELOG.md` (`18-10-PLAN.md:7-19`); "Drift beside the engine speed (Phase 18, D-02)" is written seven waves later by 18-11. Round 1 raised exactly this for 18-14 (L741) and it was fixed there, not here. The station-contact rule is also a planner choice in an area where Oolite does something else entirely: a drifting player meets the station through `collideWithShip` with the station's mass (`ShipEntity.m:11089`, `StationEntity.m:1159-1163`), not through a 0.5-restitution bounce. That is covered by DOCK-09 in spirit, but no row says "drift into the hull bounces with `BOUNCE_RESTITUTION`".

**Suggestions.** Move the D-02 row into this plan's first commit and add one FIDELITY line for the drift bounce.

### 18-11

**Summary.** The opt-in collision stage for the player, NPCs, pods and plates.

**Strengths.** The prime choice is now recorded as a Wegolite rule with its divergence row. The NaN sort key is a total order. Rank is taken once per stage.

**Concerns.**

- **MEDIUM — the deferral of a world-scale collisions-on run does not hold, and PD-06 makes the gap larger.** The ledger defers round 1's L189 because "a collisions-on run needs a harness option the frozen-harness rule forbids" (`18-11-PLAN.md` ledger, deferred row). Round 1 asked for an informational test outside `tests/acceptance`, which touches no detector, threshold or harness file. After this phase the production app runs with `collisions: true` (`18-11-PLAN.md:216`), buoys are colliders, and NPC steering near buoys changes (18-21), yet nothing steps a populated world with the stage on: QUAL-11 runs with it off, the cadence scenario has three hand-placed contacts, and 18-22 parks the player at rest. A Krait meeting a buoy at 300 m/s takes about 1,397 damage and dies; whether production traffic does that is unmeasured.
- **LOW — destroyed flags read stale energy when a body has two contacts, or a contact and a laser hit, in one tick.** The stage computes `selfDestroyed = dam1 > energy` from energy before the ledger (`18-11-PLAN.md:196`), while the C reads it after earlier damage in the same frame has been applied (`ShipEntity.m:11111-11112` after `takeScrapeDamage` of a previous contact). The reversal and nudge decision can differ from the ledger's lethality. Deterministic.
- **LOW — the player's total velocity leaves out `impulse`.** "Drift plus forward times speed" (`18-11-PLAN.md:196`) ignores the dock-bounce impulse (`src/sim/dock/step.ts:119`), up to tens of m/s for about a second after a station bounce.

**Suggestions.** Add a non-gating test under `tests/sim` that steps two or three populated seeds for a few thousand ticks with `collisions: true` and `fullHullTable()` and records contacts, kills and their causes in the SUMMARY. Record the two LOW items in the collision FIDELITY row.

### 18-12

**Summary.** Phase close.

**Concerns.**

- **LOW — the FIDELITY walk list predates round 2.** `18-12-PLAN.md` truth 2 enumerates the rows to check but not the ones the replan created or this review asks for: sticky routing, buoys as proximity candidates and the missing prefilter (18-21), the drift bounce at the station (18-10), the torus surface (18-07), the dead stage 4 (18-02).

**Suggestions.** Extend the list; the walk is the only place a missing row is caught.

### 18-13

**Summary.** Wires the static hull artifact into the session.

**Concerns.** No findings in focus. Both hull chunks still load in the boot `Promise.all`, so no hit depends on chunk timing.

### 18-14

**Summary.** Per-world buoy state, now with `subentityTakingDamage`.

**Strengths.** The invariant "flag false when the subentity is detached" is enforced in three places (ledger clear in 18-15, parser reject, sanitiser repair), matching `ShipEntity.m:8187-8188`. A world whose subentity was hit once and recharged keeps the flag and therefore the `buoys:` line; that is Oolite's behaviour (nothing clears the flag on a hull hit or on recharge) and the hash test says so (`18-14-PLAN.md:149`).

**Concerns.** No findings in focus.

### 18-15

**Summary.** Sticky frangible routing, subentity energy and detachment, pods and plates as laser targets.

**Strengths.** The port is the C's: set on a subentity win, read by every later hit from any shooter, cleared at detachment, never touched by a ram. The hit counts are right (14 routed hits detach the subentity; the buoy has lost 2.1 by then).

**Concerns.**

- **LOW — within one tick the routing differs from Oolite's sequential frame.** Records are queued for every shot and applied afterwards, so (a) a second shot in the tick that detaches the subentity is still routed 1 % / 100 % and its 100 % record "changes nothing" (`18-15-PLAN.md:168`, `:172`), where Oolite's second shooter would meet a buoy with the flag cleared and the subentity gone and deal full damage to the hull; (b) the flag is set in ascending shooter id, not in Oolite's update order. At most one shot's damage per event. Deterministic.
- **LOW — `resolveShotHits` is documented as "applies nothing"** (`src/sim/combat/step.ts:341-343`) and now writes `World.buoys.<key>.subentityTakingDamage`. The task does not ask for the comment to change.

**Suggestions.** Record (a) and (b) in the sticky FIDELITY row; fix the doc comment. Since the sticky rule gives a result nobody would guess (hull hits do 1 % until 200 subentity energy is gone), consider one extra shot pair in 18-20's session reading `buoy.energy` and `buoy.subEntities[0].energy`; it is cheap and it is the only new rule of the replan with no real-engine check.

### 18-16

**Summary.** `collideWithShip` and the heat-free scrape as pure kernels.

**Strengths.** The split matches the C exactly, including the double-death case (both net changes zero). `destroyable` comes from the fixture.

**Concerns.** No findings in focus.

### 18-17

**Summary.** Drift integration and braking for NPC ships and buoys.

**Strengths.** `BUOY_THRUST = 100` is the shipdata value (`Resources/Config/shipdata.plist:1091`), giving 500 m/s² and PD-02's 10 m and 122 m. Brake-then-integrate matches `ShipEntity.m:5808-5816` and `:2633-2637`.

**Concerns.**

- **MEDIUM — this plan consumes a quantity 18-20 measures and is not behind 18-20's gate.** 18-20 Task 2 measures "the buoy's total displacement until it stops" (`18-20-PLAN.md:155`), which is this plan's `stepBuoyDrift` and the `braking-npc.json` buoy fixture. The 18-20 ledger claims "an open MISMATCH gates every consumer", but only 18-04, 18-07, 18-09 and 18-16 carry `depends_on: 18-20` and the precondition (`rg -n precondition 18-*-PLAN.md`). 18-17 depends on 18-03 and 18-14 only, so a buoy-displacement MISMATCH stops 18-20 and 18-17 still runs in wave 3. 18-10 (player braking, which sets the probe's closing speed) is in the same wave as 18-20 and cannot be gated at all.

**Suggestions.** Add `depends_on: 18-20` and the precondition here. For 18-10, either move it to wave 3 or state in 18-20 that a braking mismatch reopens 18-10.

### 18-18

**Summary.** Buoys as movers in the collision stage; cadence, cost, totality, the producer-keyed tripwire.

**Strengths.** A ram that takes the subentity to 0 goes through the same ledger branch as a laser, so the sticky flag is cleared and 18-19's blast fires for both. The tripwire can no longer be red on day one (`src/sim/events.ts:179`, `:227` are the only matches for `playerDestroyed` in `src`).

**Concerns.**

- **LOW — the tripwire keys on two guessed spellings.** A Phase 20 that names the mode `"destroyed"` or emits through a helper or a constant passes the guard with the marker still in place. The one thing Phase 20 cannot avoid changing is the ledger's player floor (`src/sim/combat/ledger.ts:25-26`).

**Suggestions.** Add a third trigger on the floor's marker text or constant in `ledger.ts`.

### 18-19

**Summary.** The blast pushes ships, buoys and the player; every exploding body is a source.

**Strengths.** Sources, order and masses for a dying buoy are the C's. Reading `subentityEnergy` before and after `applyLedger` catches laser and ram detachments alike.

**Concerns.**

- **MEDIUM — the plan pins a false Oolite citation into FIDELITY, and the falsehood is mine.** Round 1 (L284) said the station is skipped by the blast "because its status is `STATUS_ACTIVE`, which `isInSpace` does not list (`Entity.m:1033-1041`)". That is wrong: `isInSpace` lists `STATUS_ACTIVE` (`Entities/Entity.m:1043`), and stations are `STATUS_IN_FLIGHT` anyway (`Universe.m:5056-5059`). The replan copied it into a truth (`18-19-PLAN.md:26`), the decision row (`:218`) and a gate that requires the string `1033-1041` in FIDELITY (`:227`). What the C does: the station is a receiver, `addImpactMoment` is not overridden (`StationEntity.m:1159-1163` overrides only `adjustVelocity`), so its velocity changes by at most about 0.03 m/s (the 68 m/s player case scaled by 214,737 / 455,223,200), and `applyThrust` removes it before `applyVelocity` moves anything (`ShipEntity.m:5808-5823` then `:2633-2637`; default thrust 15, `ShipEntity.m:270`, so 75 m/s² per second of frame time). "The station never moves" is therefore right as behaviour and wrong as recorded reason. The launching-player half of L284 stands (`Entity.m:1038`).
- **LOW — "the buoy itself is not its receiver (Oolite's subentity is part of the buoy)" is true by accident.** A detaching subentity is added to the universe at its absolute position (`ShipEntity.m:7895-7904`) and its blast does include the parent (`:7680-7698`); the parent gets nothing only because the subentity sits at `(0, 0, 0)`, so `p2` is exactly zero and `vector_normal` returns the zero vector. The rule in `18-19-PLAN.md:196` would be wrong for any subentity with an offset.

**Suggestions.** Replace the station reason in the truth, the row and the gate with the lines above (gate on `1159-1163` or `5808-5823` instead of `1033-1041`), and record it as "pushed and braked to rest within the frame in Oolite; not pushed here". State the buoy-receiver rule as "the push direction is zero at a zero offset".

### 18-20

**Summary.** PD-03 measurements on real Oolite, now the gate for four consumers.

**Strengths.** The 100 m/s case reaches contact; the engine speed is asserted from the log; comparison is at the observed closing speed with the logged frame delta.

**Concerns.**

- **MEDIUM — the ram probe cannot tell which part of the buoy was hit, and the two answers differ by two orders of magnitude.** If the Cobra is `e1` and only the buoy's inner assembly touches, `doOctreesCollide` returns the subentity (`ShipEntity.m:1909-1918`) and `m2` is 7,646.79 kg, not 698,691.19 kg (`ShipEntity.m:11054`): the player's damage and rebound are about 91 times and 9.6 times smaller, and the damage lands on the subentity. If the buoy is `e1`, the contact is always the whole buoy (`:1899-1907`, `CollisionRegion.m:352-356`). Which is `e1` depends on the collision chain, not on anything the probe controls. The log has "the buoy's position, velocity and energy" (`18-20-PLAN.md:155`) but not the subentity's energy, and the comparison is against "the 18-03 reference" without saying which row. A subentity contact compared with the whole-buoy row is a false MISMATCH that stops four plans; the reverse is a false SAME.
- **MEDIUM — the gate does not cover every consumer** (see 18-17; counted once there).

**Suggestions.** Log `buoy.subEntities[0].energy` every frame and pick the reference row (whole buoy or subentity) from which energy dropped; state that in the verdict. Run the 100 m/s case from two approach directions so at least one is a clean hull contact.

### 18-21

**Summary.** New plan: live buoys join the NPC proximity pass (PD-06).

**Strengths.** Reading buoys through the world view puts liveness and the live pose in one place, and `avoid.ts` already resolves an alert through `ctx.view.body` (`src/sim/npc/avoid.ts:36-47`), so a destroyed buoy lapses the alert as Oolite's weak reference does (`ShipEntity.m:6089-6096`). Mass, the no-crew rule for the buoy side (`ShipEntity.m:6116`) and the zero-offset identity are right. An unalerted world writes nothing, so pristine hashes hold.

**Concerns.**

- **MEDIUM — "as in Oolite" is not true for the alert distance, and the recorded excuse for the difference no longer applies.** Oolite reaches the pair test only for entities left in the same collision chain by `filterSortedLists`, which keeps a pair when their extents of twice the collision radius overlap on each axis (`Universe.m:6713-6780`: `start = position.z - 2.0f * collision_radius`, `finish = start + 4.0f * collision_radius`). For an isolated ship and buoy on one axis that is `d < 2 (r_ship + 59.14)`. Wegolite has no prefilter, a divergence recorded in Phase 14 with the reason "never affects a pair of equal radii and is a no-op near the station, where the planet chains every entity" (`src/sim/npc/proximity.ts:27-33`). Neither half holds for the pairs this plan adds: the radii are unequal for all nine NPC kinds, and the witchpoint buoy is nowhere near the station. Head-on, Wegolite alerts at `4 x 59.14 = 236.6 m` (`pairTriggers`, `proximity.ts:84-91`); Oolite alerts at 163.8 m for a Shuttle, 176.3 m for an Adder, 193.2 m for a Sidewinder and 218.7 m for a Krait. At 300 to 370 m/s those 18 to 73 m are 5 to 30 % of the whole reaction window, and they decide the marginal cases: by a constant-rate turn estimate a Sidewinder clears the sphere sum by about 20 m with Wegolite's alert and overlaps it with Oolite's. The plan cites only `CollisionRegion.m:308-311` (`18-21-PLAN.md` truth 1) and PD-07 then accepts the moved acceptance numbers as "more Oolite-faithful", freezing a behaviour that is more cautious than Oolite's.
- **LOW — the tracer's truth is a universal the ported rule does not promise.** "Its centre never comes closer to the buoy's centre than the sum of the two collision radii" (`18-21-PLAN.md:149`) has roughly 16 to 20 m of margin for a Krait or Sidewinder at full speed even with an instant pitch rate, and Oolite's own NPCs can touch a buoy. A failing case invites tuning the port. The CHANGELOG line "steer around navigation buoys instead of flying into them" overstates it the same way.
- **LOW — no path is defined if a pin other than the acceptance numbers moves.** PD-07 covers QUAL-11 only. The plan forbids touching `tests/golden/world` and asserts that populate, npc-cadence and the flight-hash pins "pass unchanged" (`18-21-PLAN.md:152`, `:163`), which holds only if none of those worlds has a steered ship inside a buoy's alert zone. That is unchecked, and NPCs are placed on lanes that start at the witchpoint.

**Suggestions.** Port the necessary condition of the prefilter for the static pairs (`|d_axis| < 2 (r1 + r2)` on each world axis before `pairTriggers`; cheap, deterministic), or keep the divergence and rewrite the Phase 14 row with the numbers above, and say in the PD-07 record that the accepted values come from an earlier alert than Oolite's. Make the tracer assert the alert tick and a measured closest approach per kind, with "no contact" asserted only for a geometry the rule can clear with margin. Before the QUAL-11 rerun, list which pinned worlds have a steered ship within 236.6 m of a buoy, and say what happens if one does.

### 18-22

**Summary.** New plan: a traffic-on browser spec (destroyed nav buoy leaves the scanner, ident locks the station, static chunk load path).

**Strengths.** The firing bound accounts for sticky routing (250 plus 200 energy, `18-22-PLAN.md:82`), so the replan's own rule does not time the spec out. The player is at rest 2,000 m away, so no collision or blast enters.

**Concerns.** No findings in focus.

---

### Overall

**Risk Assessment: MEDIUM.**

The replan did what round 1 asked on the rules that carry the phase. The prime role, the sticky routing with its clears, the frangible split, the split velocity change, both brakes, the two-source buoy blast, live-mass jump blockage and the compass fallback now trace to the right C lines in executable task text, not only in ledgers. I found no path by which a world that never fires, idents or collides changes its hash, and no frame-time read: every new mechanism runs inside the fixed step, new state is pristine-omit, and the new flag's invariant is enforced at the ledger, the parser and the sanitiser.

What keeps it at MEDIUM:

1. **18-21 (PD-06):** the proximity port omits Oolite's 2r-extent chain prefilter (`Universe.m:6713-6780`), whose recorded "no-op" justification does not apply to buoys. Wegolite alerts at 236.6 m where Oolite alerts at 164 to 219 m, and PD-07 freezes the result as "more faithful".
2. **18-19:** a false station-exclusion citation (`isInSpace` does list `STATUS_ACTIVE`, `Entity.m:1043`) is pinned by a gate. The error originated in my round-1 review.
3. **18-20 / 18-17:** the ram probe cannot distinguish a hull contact from a subentity contact (m2 differs 91-fold), and 18-17 consumes a measured quantity outside the gate.
4. **18-11:** still no populated-world run with collisions on, although the app ships with them on and NPC steering near buoys changes; the deferral's reason does not hold for a test outside `tests/acceptance`.

The LOW items are recording and edge matters: the dead fourth stage of `doOctreesCollide` shared by oracle and port, the torus surface still reading layout buoys, same-tick routing order, stale energy for destroyed flags, the drift decision row, the tripwire's spellings, a stale RESEARCH sentence, and the 18-12 walk list.

All 22 plan ids are covered above.

---

## Opus Review

## Phase 18 plan review, round 2 (opus): executability, sequencing, code grounding

Reviewer focus: whether an executor succeeds from each plan alone; whether waves and depends_on match the real data dependencies (including the 18-20 gate and the placement of 18-21 and 18-22); whether read_first/action identifiers name real code; whether acceptance criteria can be checked and are non-vacuous when plans run in order; whether the touched guards, pins and goldens are named; whether the remote steps can run as written; over-engineering against the "necessary technical minimum".

Method: read every plan's front matter, truths, tasks and ledger; checked identifiers against the tree at `8f33318` (the baseline `76229f5` used by the gates has no `src/`, `tests/` or `tools/` commits after it, so `[HEAD=…]` annotations remain valid); checked Oolite claims against `/home/opencode/git/oolite`.

### Wave and dependency check (whole phase)

I recomputed every wave from depends_on. Each one matches: 18-20 is in wave 2 after 18-02 and 18-03 (wave 1); 18-04, 18-09 and 18-16 are in wave 3 after 18-20. The chain 18-05 → 18-15 → 18-06 → 18-07 → 18-08 runs through waves 4 to 8. 18-11 and 18-22 are in wave 9, 18-18 in 10, 18-21 in 11, 18-19 in 12 and 18-12 in 13. Plans that share a wave have disjoint `files_modified`: wave 2 is {10, 13, 14, 20}, wave 3 is {04, 09, 16, 17} and wave 9 is {11, 22}. Every plan that reads the 18-20 output (18-04, 18-07, 18-09, 18-16) depends on 18-20 directly, and its Task 1 has the todo-absence `<precondition>` (18-04-PLAN.md:~Task 1, 18-07 Task 1, 18-09 Task 1, 18-16 Task 1). The ledger claim for L442 therefore holds in the executable text. 18-18 reads 18-20 only transitively, through 18-11 → 18-09 → 18-20, which is enough for a SUMMARY comparison. 18-12 reaches every plan transitively.

One edge in the chain is artificial: 18-19 → 18-21. The two plans share no file. The edge only serialises the acceptance baseline, at the cost of one wave. It is harmless, but see 18-12 L-1.

---

### 18-01

**Summary:** Measures the Coriolis octree and ships the four static hulls as their own bounded lazy artifact.
**Strengths:** The grounding is accurate. `MAX_HULL_NODES 16_384`, `MAX_HULLS 16` and `MAX_HULL_ARTIFACT_BYTES 200_000` exist at `src/content/schemas/ship-hull.ts:36,39,47`, and `checkHullTree` at `:58`. All six `.dat` files are vendored (`third_party/oolite/Models/oolite_coriolis*.dat`, `oolite_buoy*.dat`). The `display_name ?? name` source is the real pattern at `tools/oolite-ingest/convert/npc-ships.ts:525-540`. The buoy record has no subentity rotation (`shipdata.plist:1045-1047`, orientation (1,0,0,0)), so the identity-orientation refusal is safe. The cap guard is non-vacuous: `HEAD=3`.
**Concerns:** None in my focus.
**Suggestions:** None.

### 18-02

**Summary:** Independent dock-mouth ray fixtures from the meshes, plus a transliterated octree-against-octree reference.
**Strengths:** The prime-role correction (L78) is now in executable text, with discriminating `prime-smaller`/`prime-larger` fixtures and a swapped-variant self-check. The oracle guard (`tests/guards/oracle-independence.test.ts`) allows relative imports, `node:` built-ins, zod and vitest, so `readDat` with `readFileSync` over `third_party/` passes. `tests/oracles/combat/` does not exist yet, so the plan creates a new tree with no collisions.
**Concerns:**
- LOW: The edge floor (≥4 `edge: true` rays at two leaf widths) feeds 18-20's real-engine check. There the player's weapon origin is offset from the ray (see 18-20 H-1), so the two plans' assumptions about edge rays need reconciling.
**Suggestions:** Tag each fixture with whether it is eligible for real-engine measurement (non-edge only), so 18-20 can choose without judgement.

### 18-03

**Summary:** Response, braking, scrape and blast fixtures derived from the C.
**Strengths:** I re-read `ShipEntity.m:11020-11152` against the truths. The loc/v2b/v1a sequence, the `v2b < -1` return, the 1 m self step, the `magnitude2(v) <= 0.1` replacement, the parent-velocity application (11103-11107), the reversal on `other` itself (11117-11118) and the frangible routing (11123-11128) all match. The player braking order also matches: applyVelocity, then `velmag - dt*thrust*thrust_factor`, then cleanup (`PlayerEntity.m:3372-3405`, `OO_VARIABLE_TORUS_SPEED` defined at `PlayerEntity.h:47-48`). The buoy's `thrust = 100` is in `ships-client.json` extras.
**Concerns:** None in my focus.
**Suggestions:** None.

### 18-04

**Summary:** The station joins the laser candidates; the subentity hit rule is ported; the dock-mouth fixtures run against the port.
**Strengths:** The L456 disposition is correct when the plans run in order. 18-13 writes the exact sentence `Subentity data arrives (plan 18-13); the hit rule ignores it until plan 18-04.`, and 18-04 gates on the absence of both that sentence and `Not ported` (today at `src/sim/combat/hit.ts:17`), plus the presence of `1323-1357`. The gate is not vacuous. `never candidates in this milestone` exists at `src/sim/combat/step.ts:353`. The E-48 row is at `FIDELITY.md:65,748`. The `StationEntity.m:1128-1141` consequence is recorded.
**Concerns:**
- LOW: The Task 2 behaviour also says "the buoy fixtures likewise". Buoy HitTargets only become candidates in 18-05, but the oracle test builds the target by hand from `fullHullTable()`, so this works. It is worth stating, so an executor does not wait for 18-05.
**Suggestions:** In the oracle test header, add a sentence that the buoy target is built by hand.

### 18-05

**Summary:** Buoy health, recharge and destruction at the live pose; one tumble for hit and draw.
**Strengths:** Grounded. `BUOY_ROLL_RATE`/`BUOY_PITCH_RATE` exist at `src/render/bodies/buoy.ts:49-50`. The renderer already drives buoys with `flightTime` (`render-driver.ts:233` → `sync.ts:127`), so `buoyOrientation(flightTime)` gives one source of truth. `shipDestroyed` is consumed only by the explosion branch (`event-router.ts:496-509`), so a static id in the event is safe.
**Concerns:**
- LOW: `buoyPosition` always adds the offset. 18-21 later makes the view skip the addition when the offset is zero ("so no frozen number moves"). If a layout coordinate is ever `-0`, the two helpers return different signed zeros for the same buoy.
**Suggestions:** Give `buoyPosition` the same zero-offset short-circuit that 18-21 specifies for the view, so every consumer agrees bit for bit.

### 18-06

**Summary:** Ident for the statics, buoys, pods and plates, with compiled names.
**Strengths:** The `layout` threading and the destroyed-buoy loss are concrete. The entity-id-scope guard is named. The tripwire evaluation is explicit.
**Concerns:** None in my focus.
**Suggestions:** None.

### 18-07

**Summary:** Buoys block a completing jump at their live pose and mass; the sanctioned fixture move; the clearance sweep.
**Strengths:** The numbers check: sqrt(0.1 × 698,691.1875) = 264.33 m. `ShipField.buoy` lands here before 18-08 consumes it, and 18-08 depends on 18-07.
**Concerns:**
- LOW: The pose comment calls 396.1 m "the player-buoy contact distance" (18-07-PLAN.md:39 and the Task 3 action). Sphere contact is 59.14 + 72.70 = 131.8 m (18-20 uses that figure). 396.1 m is the blockage radius plus both radii. The wrong label would be copied into the spec comment and the Key Decisions row.
**Suggestions:** Use "264.3 m blockage radius plus both hull radii (396.1 m)" in both places.

### 18-08

**Summary:** Destroyed, moved and stripped buoys in the view, the scanner and the compass.
**Strengths:** `ctx.core.worldLifecycle?.world` is the real read path (`render-driver.ts:252,262`). The compass fallback reads the 18-07 field.
**Concerns:**
- LOW: The action says to find the subentity mesh "by its model name in the loaded GLB". The loaded buoy model's nodes are named `"hull"` and `"core"` (`src/render/bodies/buoy.ts:70`, checked at `:210-214`). There is no node named after `oolite_buoy_subents`.
**Suggestions:** Name the `"core"` node and reuse the existing `NODE_NAMES` check.

### 18-09

**Summary:** The octree-against-octree port and the four-stage composition.
**Strengths:** The prime/axial rule matches `ShipEntity.m:1897` and the composition matches `:1899-1918`. A prime subentity hitting the other's hull returns `other`, which is why 18-18 "when the buoy is self, a contact is the buoy body's" is correct. The precondition is present.
**Concerns:** None in my focus.
**Suggestions:** None.

### 18-10

**Summary:** Player drift, braking, reset sites, and the station-contact drift branch.
**Strengths:** Every named site exists: the `impulse` resets at `launch.ts:114`, `arrival.ts:160`, `computer.ts:59` and the capture at `dock/step.ts:174`; `respondToContact` is at `dock/step.ts:95`; `BOUNCE_RESTITUTION`/`MIN_OUTWARD_SPEED` are at `:56,62`. `FlightConfig` is built in one place (`config.ts:85`), so adding `thrust` does not ripple into the tests. The dock tests are diff-gated.
**Concerns:**
- LOW (new branch): The drift branch is self-contradictory. It says to "keep the existing reflection and speed/impulse split … exactly as they are" (which includes the `MIN_OUTWARD_SPEED` floor on the non-drift velocity, `dock/step.ts:114-117`). It also says the "combined outward speed is at least `MIN_OUTWARD_SPEED`". When the drift's outward part already exceeds 8 m/s, keeping the floor unchanged still adds up to 8 m/s to `impulse`. The plan leaves the choice to the executor ("planner choice … recorded in the SUMMARY"), so the 68/350 m/s cases have no fixed expected value.
**Suggestions:** Choose one rule in the plan. Either compute the floor on the combined outward speed and apply the top-up to `impulse` only, or keep the floor as is and accept the extra push. Say which one the "exactly one bounce" test pins.

### 18-11

**Summary:** The collision stage: rank, sweep, response, scrape ledger and the app opt-in.
**Strengths:** The L544 disposition holds (`kill.property.test.ts` is listed and verified). `FlightState.position` is mutable (`flight/state.ts:49`), so the world-side write is feasible, and the plan amends the D-14 sentence in `sim.ts:8-11` that it breaks. `HitRecord.kind: "scrape"` does not clash with the existing `SimEvent` `"scrape"` (`event-router.ts:518`) because they are different unions. The acceptance harness never sets `collisions` (`tests/acceptance/detectors.ts:1133-1151`), so "frozen" holds.
**Concerns:**
- LOW: The "byte-identical dock with collisions on/off at 68 m/s drift" case is vacuous for the stage in this plan, because the station is not a collider and no other collider is present. It is a regression test of 18-10's branch. That is fine, but it should not be cited as evidence about the stage.
**Suggestions:** Label it as a regression test of 18-10's branch.

### 18-12

**Summary:** Phase close: todos, the FIDELITY walk, the tripwire evaluation, `verify-full` and QUAL-11.
**Strengths:** The only `verify-full` (PD-04). It honestly records that QUAL-11 does not exercise collisions.
**Concerns:**
- LOW (L-1): The baseline for "numbers unchanged" is "plan 18-21's" run, but 18-19 (wave 12) runs the acceptance afterwards, so the latest recorded run is 18-19's. The 18-19 gate checks only "fewer than 21 passed", not "unchanged numbers", so a drift introduced by 18-19 would be attributed to 18-12. 18-19 probably moves nothing: the harness passes no `debris` content (`detectors.ts:1144-1148`), so no blast fires.
**Suggestions:** Compare with 18-19's run, and add "numbers unchanged against 18-21's" to 18-19 Task 3.

### 18-13

**Summary:** Traffic-gated load of the static hulls into the one hull table; boot failure; twins on `fullHullTable()`.
**Strengths:** The L731 disposition holds (start-session rejection case). The chunk measurement uses `run --rm test sh -lc "npm run build && …"`, which the wrapper can run. Twin `realHullTable` call sites exist (gate `HEAD=7 matches in 3 files`).
**Concerns:** None in my focus.
**Suggestions:** None.

### 18-14

**Summary:** Per-world `World.buoys` state (offset, velocity, subentity energy, sticky flag), pristine-omit, as a v4 amendment.
**Strengths:** The insertion points are real (`serialize.ts:176-180` static health line, `snapshot.ts:503-517,1018-1032`, `sanitize.ts:786`). `MAX_ENTITY_VELOCITY = 1e4` (`limits.ts:126`) matches the parser bound. The `MAX_BUOY_OFFSET` derivation is consistent with `BUOY_THRUST 100` (5 × 100 = 500 m/s²).
**Concerns:** None in my focus.
**Suggestions:** None.

### 18-15

**Summary:** Buoy subentity as static targets 6/7 with sticky routing, recharge and detachment; pods and plates as laser candidates.
**Strengths:** The sticky routing (L231) is ported from the right lines. `Universe.m:5634-5636` sets the flag only on a subentity win and never clears it on a hull hit. `ShipEntity.m:10202-10207` reads the flag, not the current hit. `:1245-1247` clears it on a dead reference. The executable text implements all three (set in `resolveShotHits`, read for every buoy hit from any shooter, cleared by the ledger write that reaches 0). The gates are non-vacuous (`HEAD=0`). `LAST_RESERVED_STATIC_ID = 99` (`ids.ts:44`) leaves room for ids 6 and 7, and no guard pins the reserved range.
**Concerns:**
- LOW (new, fidelity bookkeeping): In Oolite the flag is also set without firing. The HUD's target-sensitive reticle calls `firstEntityTargetedByPlayerPrecisely` every frame (`HeadUpDisplay.m:3314,3321`), which calls `firstShipHitByLaserFromShip` (`Universe.m:5756`), whose `:5634-5636` sets `subEntityTakingDamage`. This happens only with that reticle feature, but it is a path the sticky rule does not port.
**Suggestions:** Add one FIDELITY sentence to the sticky-routing row: set only by shots in Wegolite; in Oolite also by the precise reticle.

### 18-16

**Summary:** Pure `collideWithShip` port and the heat-free player scrape.
**Strengths:** The split `dvOtherBody`/`dvOtherSubentity` (L369) is exactly the C. `otherParent adjustVelocity:+vel2a` (11103-11104) and the selfDestroyed reversal on `other` (11117-11118) land on different objects for a subentity contact, so the parent keeps its push. The hand case "dp1 = loc × (10/120) × 100" reproduces the C's same-sign nudge (11140-11146) and is protected by the prohibition on "fixing" signs.
**Concerns:** None in my focus.
**Suggestions:** None.

### 18-17

**Summary:** NPC and buoy drift braking and integration.
**Strengths:** No ship spawn path sets a non-zero ship velocity today (`world.ts:572-575` only for `init.velocity`, used by debris), so "zero velocity writes nothing" holds. Cargo and wreckage keep `driftEntity` (`world/step.ts:213-235`).
**Concerns:** None in my focus.
**Suggestions:** None.

### 18-18

**Summary:** Buoys as colliders that move, the subentity contact rule, cadence, cost, totality and the producer-keyed tripwire.
**Strengths:** The ram routing without bleed matches `ShipEntity.m:11122-11127`. The 241.3 m/s destroy threshold checks (250 × 5e7 / 214,737.6875 = 58,210 m²/s²). The four-input guard design keeps it from being red on day one or silently non-matching.
**Concerns:**
- MEDIUM (M-1, the new tripwire): The producer key is narrower than the Phase 20 designs it must catch.
  - Rule (a) excludes all of `src/sim/events.ts`, not just the two declaration lines (`:179` union member, `:227` kind list). A Phase 20 factory such as `export function playerDestroyed(position) { return { kind: "playerDestroyed", position } }` placed in `events.ts` evades it.
  - Rule (a) also matches only an object-literal spelling. `kind: PLAYER_DESTROYED` or a factory call elsewhere evades it.
  - Rule (b) guesses the mode name `"dead"`. Phase 20 may use `"destroyed"`, `"dying"`, `"exploding"`, or a flag outside `FlightMode`.

  The owner's rule is "guard fails on the first consumer". This guard catches one of several plausible first producers.
- LOW: `tests/sim/combat/collision-stage.test.ts` may be edited (Task 1: "move the replay's start pose off the buoy's line") but is not in `files_modified`.
- LOW: Traffic-on specs that might ram the nav buoy are found only at the remote run, where the plan can only stop and report. A cheap pre-audit in Task 1 would flag the risk early: the maximum straight-line distance each traffic-on spec flies from the dock, against the 10 km nav-buoy distance.
**Suggestions:** Key rule (a) on any `playerDestroyed` token in `src/sim/**` outside exactly the two declaration sites (match those two lines, not the file). Make rule (b) "any new member of `FlightMode`" (pin today's three, `flight/state.ts:18`). Add a synthetic factory-in-`events.ts` input that must fail.

### 18-19

**Summary:** Blast push onto ships, buoys and the player; every exploding body as a source.
**Strengths:** The station exclusion now cites its real reason (status, `adjustVelocity` override only). The re-pin rule requires a prediction from a fixture or formula.
**Concerns:**
- LOW: Task 3's acceptance gate checks only the count of passed seeds. Add "numbers unchanged" (see 18-12 L-1), because this plan edits `src/sim/world/**`.
**Suggestions:** As above.

### 18-20

**Summary:** PD-03 real-Oolite measurements (dock mouth, player-buoy ram, pod/plate blockage) that gate four consumers.
**Strengths:** The gating is wired correctly (consumers depend on it, and each has a precondition). Outputs stay out of the tree, with a porcelain check. The ram start of 150 m is now reachable (100²/(2×32) = 156 m braking against a contact at ≤131.8 m). `setTotalVelocity` is the real setter (`OOJSShip.m:1738-1740` → `ShipEntity.m:11164`). The remote wrapper, verbs and output guard match `tools/oolite-reference/run-remote.sh`.
**Concerns:**
- HIGH (H-1, Task 1 can produce a false MISMATCH that blocks the phase):
  - Every shot at the main station in real Oolite calls `markAsOffender` and `launchPolice` (`StationEntity.m:1128-1141`). The Coriolis has a JS AI (`ai_type = "oolite-stationAI.js"`, `shipdata.plist:1692`), so `hasNewAI` holds and the first fixture shot launches police Vipers out of the dock. They launch through the slot, which is exactly where the `dock` winner rays and the slot-edge rays run. Later shots in the same "one session" can end on a launching Viper, or be confused by the station's raised alert level and its target choice.
  - The beam does not start at the player's centre. It starts at the forward weapon offset (Universe.m:5756 path; Cobra `weapon_position_forward` lateral offsets of −1.7 to −4.6 m in `shipdata.plist:162,363`). The probe "moves the player to the start of each … ray", so every shot is displaced from the fixture ray, and the edge fixtures sit only two leaf widths from an edge.
  - The station rolls continuously, so the conversion from model frame to world frame must happen on the firing frame.

  A MISMATCH from any of these creates the todo, and that todo stops 18-04, 18-07, 18-09 and 18-16 until the owner resolves it.
- MEDIUM (M-2, Task 3 is likely to end "unobservable"): A barrel at 9.5 m or a plate at 5 m from the player's centre lies deep inside the Cobra's 72.7 m sphere. The player has no scoop, so `collideWithShip` damages and destroys or pushes the pod in the same frame, before `witchJumpChecklist` (`PlayerEntity.m:6544-6560`) runs. The plan anticipates this, but then D-08's divergence row gets no evidence. The claim that needs evidence is the class-free loop, and that can be tested without overlap. The probe is an OXP, so it can define a cargo-class object (`like_ship` the barrel, `scan_class CLASS_CARGO`) with a large `density`, so that its mass gives a blockage radius of hundreds of metres. Place it well outside both hulls.
- LOW: Task 2 needs "engine speed 0 before contact", but `ship.speed` is read-only in JS (`OOJSShip.m:450`). The player's throttle must come down through the steps file (`key` verb, decelerate held, then `waitlog` on a logged speed of 0) before the teleport. The plan does not say how.
- LOW (minimum scope): Task 1's bracket design places a second ship on the ray "just before" and "just beyond" the expected distance, for a minimum of five winning parts, each fired twice. For `dock` rays that ship sits inside the slot, where Oolite's own collision and docking logic act on it. One shot per part, with `shipTakingDamage`/`shipAttackedOther` naming the victim, plus a bracket only where the winner is ambiguous, would be enough for PD-03.
**Suggestions:**
- Run one reference session per fixture, or have the OXP reset `player.bounty`, remove ships with role `police`, and wait for the station alert to clear before each shot.
- Place the weapon origin, not the centre, on the ray start (compute the offset from the logged `weapon_position_forward`).
- Convert the ray on the firing frame (frame callback).
- Restrict the real-engine check to non-edge fixtures.
- Measure Task 3 with a heavy cargo-class OXP object.

### 18-21

**Summary:** PD-06: live buoys become NPC proximity candidates through the world view; QUAL-11 is rerun under PD-07.
**Strengths:** Grounded. `runProximityPass` (`src/sim/npc/proximity.ts:224-278`) has the station-body pattern to copy. `candidateMass(undefined)` already returns `PROXIMITY_MIN_MASS` (`:165-169`). The participant sentence to amend exists (`:19-21`, so the absence gate is non-vacuous). `proximityAlertBody` resolves through `view.body` and clears a vanished id (`src/sim/npc/avoid.ts:36-47`), so a destroyed buoy lapses as specified. The zero-offset short-circuit protects frozen numbers. The trigger zone is about 4 × 59 m ≈ 237 m (`pairTriggers`, `proximity.ts:85-92`), and the witchpoint lanes exclude one scanner range around the witchpoint (`placement.ts:165`), so few seeded NPCs should be affected.
**Concerns:**
- MEDIUM (M-3): PD-07 covers only the acceptance run. The plan's diff gate covers only `tests/acceptance` and `tests/golden/world`. If PD-06 moves a pinned unit value (app twins `sim-driver`/`tick-parity`, NPC scenario tests, `steering.property` expectations that enumerate CLASS_BUOY at `tests/sim/npc/steering.property.test.ts:253`), the executor has no rule: re-pin with cause, or stop? The traffic-on browser specs (`traffic.spec.ts`, `npc-flight.spec.ts`) are not run until 18-12's `verify-full`, two waves later.
- MEDIUM (M-4): The truth "keeps its hull clear of the buoy's hull" is stronger than Oolite guarantees. Avoidance is a midpoint steer with a 10-radius desired range (`avoid.ts:65-80`), and a fast ship whose alert fires late can still clip the hull. The plan does not name the NPC kind, speed or distance. If the test fails, the executor may be tempted to tune the steering, which would be a fidelity regression.
**Suggestions:**
- Add a rule: a moved unit pin whose cause is a steered NPC within the trigger zone of a buoy is re-pinned with that cause; any other move stops the plan.
- Run `traffic.spec.ts` and `npc-flight.spec.ts` remotely in Task 2.
- Fix the scenario (a named kind at its `maxFlightSpeed`, from a stated distance), with the expected outcome derived from Oolite's avoid rule. If contact still occurs, record it as faithful rather than fixing it.

### 18-22

**Summary:** A new traffic-on browser spec: a destroyed nav buoy leaves the scanner, ident locks the station, and the static chunk loads only with traffic on.
**Strengths:** It uses only existing hooks and fields (`setPosition`, `setSpeed`, `setOrientation`, `contacts`, `identLocked`; `src/app/probe.ts:68,384-387,418`). The chunk regex mirrors `budget.spec.ts:326`, and `ships-hulls-` does not match `ships-static-hulls-`. It is a new file, so D-06 holds. The wave-9 placement is valid because every needed path (13, 04, 05, 15, 06, 08) is upstream.
**Concerns:**
- LOW: The "derived tick bound" must include 18-15's sticky routing. A beam at the buoy's centre may make the core subentity win first. From then on every hit goes 99 % to the subentity (200 energy, recharging 1/s) and 1 % to the body, until detachment. Only after that does the body's 250 (recharging 2/s) take full hits, with laser heat throttling the rate. A bound derived from the body alone fails falsely on the remote machine.
**Suggestions:** Derive the bound from the subentity path plus heat, or aim at a hull cell the subentity does not cover. Say which in the spec header.

---

### Over-engineering against the "necessary technical minimum"

- 18-20 Task 1's bracket design (see above) is the heaviest step that does not change any code. Reduce it to one shot per winning part, with brackets only for ambiguous winners.
- Remote QUAL-11 runs appear in 18-04, 18-14, 18-15, 18-17, 18-11, 18-18, 18-19, 18-21 and 18-12. The plans themselves state that the harness cannot exercise their new paths (`realHullTable`, no collisions, no buoy mass), except for 18-21. AGENTS.md requires them after `src/sim/world/**` edits, so they are compliant, but they are pure frozen-world checks. Consider asking the owner whether one run at the end of each wave suffices.
- `CollisionStats` plus a PERFORMANCE row (18-18) and three separate fast-check suites (18-09, 18-16, 18-18) are justified by PITFALLS 17 and the totality pattern. No change is needed.

### Overall

**Risk Assessment: MEDIUM.**

The sequencing is sound. The waves match the data dependencies, same-wave plans touch disjoint files, and the 18-20 gate is wired as the ledger claims. Identifiers are well grounded: every symbol, line and HEAD count I checked exists as cited, except two labels (18-07's 396.1 m and 18-08's node name). The ledger dispositions I traced are implemented in task text, not only claimed: L456, L544, L731, L369, L232, L442 and L231.

The main executability risk is new in 18-20. A real-engine measurement against the main station triggers Oolite's offender and police response, and it ignores the weapon offset and the station roll. Either can produce a false MISMATCH, and by design a MISMATCH halts four wave-3 plans until the owner intervenes. Second-order risks:
- the producer-keyed tripwire is narrower than the Phase 20 designs it must catch;
- 18-21 has no rule for unit pins moved by PD-06, and its no-ram claim is over-strong;
- 18-20's pod/plate probe is likely to yield no evidence.

**Counts:** HIGH 1, MEDIUM 4, LOW 13.

**Top three:**
1. 18-20 (HIGH): the station-shot offender/police response, the weapon offset and the station roll are not handled in the dock-mouth probe; a false MISMATCH gates 18-04, 18-07, 18-09 and 18-16.
2. 18-18 (MEDIUM): the tripwire excludes all of `events.ts`, matches only an object-literal spelling and guesses `"dead"`; a Phase 20 factory or another mode name evades it.
3. 18-21 (MEDIUM): no re-pin or stop rule for unit pins moved by PD-06 (PD-07 covers acceptance only), traffic-on specs are deferred to 18-12, and the no-ram invariant is unspecified and stronger than Oolite guarantees.

---

## Sonnet Review

## Phase 18 plan review, round 2 (sonnet) — focus: tests, oracle independence, persistence, security

Reviewer: sonnet. Read-only. Scope: all 22 plans, verified against the repo and the Oolite checkout where a claim could be checked. Plan paths are relative to `.planning/phases/18-stations-buoys-and-collisions/`.

Tally: HIGH 0, MEDIUM 7, LOW 9.

Headline findings (details in the per-plan sections):
1. 18-14: `hashWorld` repairs `staticHealth` itself (`src/sim/world/serialize.ts:243-247`), but the plan repairs `World.buoys` only in `stepWorld`; `canon` throws on a non-finite value (`src/sim/hash.ts:30-32`). The ledger deferral of L743 rests on a wrong premise.
2. 18-02: the dock-mouth tolerance (leaf half-diagonal) is not a bound for oblique rays, and miss fixtures have no clearance rule. A correct port can fail a fixture, and the plan forbids widening the tolerance.
3. 18-02/18-09: the C's `doOctreesCollide` recurses, so its stage 4 is unreachable. The fixture and port spec "subentity against subentity returns the other's subentity" contradicts `ShipEntity.m:1899-1918`.

### 18-01

**Summary.** Content build for the four static hulls, a strict schema with caps, a digest golden, the lazy loader and the Key Decisions row.

**Strengths.**
- Per-octree and total node caps, an iterative `checkHullTree`, strict keys, a 64-character name bound (`StaticNameSchema`), and the ten-hull artifact held byte-identical by a diff gate.
- A non-identity subentity orientation fails the build instead of being silently ignored.
- Concurrent-load and drift-gate cases are specified.

**Concerns.**
- LOW: the digest golden (`tests/golden/content/ships-static-hulls.json`) is written from the same build it pins (18-01:Task 2 action). It detects drift but is no independent evidence that the octrees are right. The only independent evidence is 18-02 reaching the artifact through 18-04. The SUMMARY should say so, as it already does for the caps ("headroom over a measurement").
- LOW: the caps are 20-30 % headroom over today's measurement, so they bound growth but give no safety margin against a hostile artifact. That is acceptable because the artifact is build-time generated, never user input.

**Suggestions.**
- State in the golden's header that it is a drift pin, not a correctness oracle.

### 18-02

**Summary.** Independent geometry oracle: dock-mouth and buoy ray fixtures from exact ray-mesh geometry, plus a transliteration of `isHitByOctree` and `doOctreesCollide`, with a self-test and a brute-force soundness loop.

**Strengths.**
- The reading rule is explicit: no `src/`, no `tests/helpers`, no 18-RESEARCH probe table. The import guard is real. I read `tests/guards/oracle-independence.test.ts:36-150`: it allows only `node:*`, `zod` and `vitest`, and forbids relative imports leaving `tests/oracles`.
- The prime-role rule matches the C. `Octree.m:473-519` (`isHitByOctree` static): the radius compare at 497 only picks the crude prune, and decomposition depends only on solidity. `ShipEntity.m:1897` passes `prime_octree` as the axial tree.
- The `hit_distance > hitSub` strict compare, the hull winning ties, and the nearest-non-zero rule match `ShipEntity.m:1347-1357`.
- Edge-ray floor (`edge: true`, at least 4), a margin of at least 2 x tolerance, and a self-test that re-derives every fixture.

**Concerns.**
- MEDIUM: the dock-mouth tolerance is the winner's leaf half-diagonal (18-02:Task 1 action). `isHitByLine` returns the distance to the centre of the first solid leaf in visiting order (`Octree.m:366-368`, `hit_dist = sqrt(u0.x^2+u0.y^2+u0.z^2)` after displacing to the leaf). That is within half a diagonal of the exact hit only if the exact hit point lies inside that first-visited leaf. A leaf is solid when any triangle touches it, so a ray can enter a solid layer well before it crosses the triangle. At oblique incidence the gap is up to leaf_width / sin(incidence angle), which is unbounded as the ray approaches grazing. A ray that clips a solid leaf without hitting its triangle also reports a hit that exact geometry calls a miss. The plan keeps rays two leaf widths from slot and panel edges only, and its ray list includes a "grazing miss" with no clearance rule. A correct port can therefore fail a fixture, and 18-04 turns that into a stop-and-dispute because "never a widened tolerance".
  - Fix: add a per-fixture incidence limit (for example the beam within 30 degrees of the hit face normal), and require every `none` fixture and every runner-up to clear all triangles of the part by more than the leaf diagonal. Compute the clearance with a point-triangle distance in the self-test.
- MEDIUM: the plan's prime-role evidence is thinner than it reads. The self-test variant that makes the larger tree axial must "disagree with at least one of the two prime-role fixtures" (L193). That tests one wrong port variant, and only collectively. Role matters only where the two crude prunes differ (the inscribed-sphere prune at `Octree.m:497-512`), so each fixture must flip on its own under a role swap. A second wrong variant, "always smaller axial", should also fail one of them.
  - Fix: require each of `prime-smaller` and `prime-larger` to flip individually under both swap variants.
- MEDIUM: the soundness property is one-directional (reference hit implies brute-force overlap). A reference that over-prunes, or one that always says miss, passes it. 18-09's agreement test compares the port with this same reference, so a shared over-prune is invisible. Add a completeness property: whenever brute force finds an overlap whose penetration exceeds the inscribed-sphere slack (a margin derived from the cube half-width), the reference must report a hit.
- MEDIUM: the composition truth lists four stages and says subentity-against-subentity "returns the other subentity's index". In the C, stage 2 is `doOctreesCollide(se, other)`, recursive (`ShipEntity.m:1899-1906`). Inside it the third stage tests `se` against `other`'s subentities, so a prime-subentity against other-subentity contact returns `other` from stage 2 before stage 4 (`:1920-1938`) runs. Stage 4 is shadowed, and the fixture's expected "other subentity index" disagrees with the C. The `{ octree, offset }` hull shape also has no nested subentities, so the reference cannot express the recursion. In practice only buoy-buoy pairs have subentities on both sides (unreachable, 18-18), so the harm is a wrong fixture and a possible stop in 18-09, not wrong game behaviour.
  - Fix: model the recursion in `doOctreesCollideReference`, change the expected result for that case to `"other"`, and add a fixture that pins the shadowing.
- LOW: the oracle is specified as "float64 geometry", while 18-03 requires frounded GLfloat locals. The C uses `GLfloat` vectors in `Octree.m`. A fixture documented as "face contact, strict or non-strict as written" is decided by one ulp, and float64 and float32 can disagree on it. Either avoid exact-boundary fixtures or fround the reference's positions.
- LOW: the independence guard checks literal path arguments only (`SRC_SEGMENT`, `tests/guards/oracle-independence.test.ts:48,125-132`). A computed path, or a read of `tests/golden/**` or `tests/helpers/**`, passes it. The reading rule stays a process rule, as the ledger accepts (disposition for L638/L649).

**Suggestions.** The incidence limit and clearance rule above; per-fixture role-swap flips; a completeness property; model the recursion.

### 18-03

**Summary.** Independent response oracle: `collideWithShip`, braking, the player's scrape and the blast, each fixture carrying a `derivation`.

**Strengths.**
- The transliteration list matches the C. I checked `ShipEntity.m:11020-11152`: `loc` from `HPvector_normal_or_zbasis`, `v2b < -1` returning before any damage, `magnitude2(v) <= 0.1`, `selfDestroyed = dam1 > energy`, the frangible parent's routing at 11123-11128, and the nudge at 11139-11146.
- The float discipline (frounded GLfloat locals, doubles for the compares with 0.1 and 0.05) is correct for the C.
- `dvOtherBody` and `dvOtherSubentity` are split, and `destroyable` is per party.
- The cross-check against CONTEXT and RESEARCH runs only after the fixtures are committed.
- Ids are checked as unique across every `tests/oracles/combat/**` JSON file.

**Concerns.**
- MEDIUM: the ledger says "every expected figure and closed-form answer is removed from truths, decisions and behaviour" (18-03 ledger, first row). The behaviour list the oracle author reads still carries them:
  - "v1a = 100, dam1 = dam2 = m x 10,000 / 50,000,000";
  - "loses 32/120 per tick" and "32 x 32 / 120";
  - "rate (|v| - 2000) / 3000 x 0.001";
  - "64 -> 14 with energy unchanged" and "lowers energy by 36".
  Some are labelled hand anchors "derived in the test from the C lines", but they are visible before authoring. The independence argument is weaker than the ledger claims. Either move the numbers into the self-test anchors the author writes from the C, or say plainly that the ledger covers masses and radii only.
- LOW: the "Input facts" block gives masses and radii from the port's own compiled content (Krait 93,291.40625 kg, buoy 698,691.1875 kg, and so on). That is shared input, not shared code. The claim "equal to a running Oolite" rests on earlier project measurements that this plan does not re-check; 18-20 covers only the buoy ram. State this as a recorded dependency.
- LOW: the nudge `t = 10 x (1/120)` is encoded as "the t of 11139", but the C uses `10.0 * [UNIVERSE getTimeDelta]` (`ShipEntity.m:11138`), a frame time. 18-11 records the divergence (18-11 line 258). The oracle's `derivation` strings should say it is a fixed-step substitution, so a reader of the fixture does not treat it as the C's value.

**Suggestions.** Remove the figures from the behaviour list, or reword the ledger.

### 18-04

**Summary.** Stations as laser candidates through the subentity hit rule, absorbing every hit, with the dock-mouth fixtures run against the port.

**Strengths.**
- The success-criterion test fails on wrong behaviour: a shot at an NPC behind the station must end on the station, and the same scene under `realHullTable()` must hit the ship.
- Pristine-hash is pinned: after 1,000 station hits the hash equals a never-hit world's.
- The invariant on every queued target, the NaN/Infinity/0/-5 amount cases, and the "tick that did not step the world has no candidate" case are all present.
- The octree-depth check against the emitted artifact is made before the fixtures run.
- The `1323-1357` header rewrite is gated by grep.

**Concerns.**
- MEDIUM (inherited from 18-02): "a failing fixture is a dispute, never a widened tolerance". Because of the 18-02 tolerance and clearance issue, this rule can turn a correct port into a stopped phase. Fix it at the source in 18-02.
- LOW: re-pinning app-twin values "when a pinned value moves because a beam now ends on the station" (Task 3) is an accepted pattern, but 18-19 states a stricter rule (a named cause plus a predicted value). Adopt the 18-19 wording here.

**Suggestions.** Reuse 18-19's re-pin rule.

### 18-05

**Summary.** Buoys hold 250 energy, recharge, and are destroyed at zero at their live pose.

**Strengths.**
- Boundary cases are explicit: the 17th pulse destroys (250 / 15 = 16.7), a destroyed buoy never revives (`value > 0` guard), two lethal records in one tick destroy once, and non-finite or non-positive amounts are skipped.
- One `buoyOrientation` is shared by the hit and the render, with a pin test.

**Concerns.** No findings in focus; the tests would fail on wrong behaviour.

**Suggestions.** None.

### 18-06

**Summary.** Ident on statics, pods and plates by compiled names, with the lock ending when a buoy dies.

**Strengths.**
- Names go through the bounded `StaticNameSchema` and `clampMessage` (T-18-15).
- The lock crosses to the app as a spec key, never an id, and the entity-id-scope guard is run.
- `identLost` is emitted on the tick the buoy is destroyed.

**Concerns.** LOW: ident works with traffic off but falls back to the key as the name, and only the traffic-on browser case (18-22) exercises names. That is acceptable and documented.

**Suggestions.** None.

### 18-07

**Summary.** Live buoys block a completing jump by Oolite's mass rule; the D-06 pose edit; the 2,048-layout clearance sweep.

**Strengths.**
- Strict compare at 263.3 m versus 265.3 m, non-finite and non-positive `buoyMass` cases, and the 2,048-layout sweep guard both directions.
- The one sanctioned edit to a browser spec is justified with distances.

**Concerns.**
- LOW: the detached-buoy blockage mass is stated as 691,044.4013671875. The C computes `mass -= [sub mass]` in a GLfloat (`ShipEntity.m:8194`). Rounded to float32 that is 691,044.375, which is the compiled hull-only mass (`tools/oolite-ingest/convert/ship-mass.test.ts:112`). The plan's value is a double that Oolite never holds (differs by 0.026 kg, about 4e-8 relative). Use `Math.fround` or the compiled hull mass so the value matches the C and the oracle's float discipline.

**Suggestions.** Same constant fix in 18-18.

### 18-08

**Summary.** A destroyed buoy leaves the view and scanner, a moved buoy is drawn where it is, a detached subentity is hidden, plus the compass fallback.

**Strengths.**
- The compass tests go through `stepFlight` (T-18-18), and the new FIDELITY row for the compass cycle model is in the plan.
- A destroyed buoy's disappearance is checked in sim queries, render and HUD.

**Concerns.** No findings in focus. The 3D-view removal of a destroyed buoy has only unit-level evidence; 18-22 covers the scanner only (see 18-22).

**Suggestions.** None.

### 18-09

**Summary.** Port of `isHitByOctree` and `doOctreesCollide`, held to the 18-02 fixtures and random agreement/totality properties.

**Strengths.**
- The precondition on the 18-20 mismatch todo and the `depends_on` on 18-20 gate the plan.
- The `wegoliteBasis` round trip (basis to quaternion, within 1e-12) closes the reflection-map hole.
- Totality is tested with NaN, Infinity, 1e308, a node array of length 7, and over-deep trees.

**Concerns.**
- MEDIUM: the port is told to implement "the four stages ... in order" and return `{kind:"subentity", index}` for subentity-against-subentity. The C's stage 2 recursion returns `other` for that contact (see 18-02). A port that follows the plan will differ from Oolite for any pair where both parties have subentities. Port the recursion (stage 2 and 3 call `doOctreesCollide` on the sub-pair) and take the expected value from the corrected fixture.
- LOW: the agreement property (300 random depth-2 pairs) compares the port to the reference only. Together with the one-directional soundness property in 18-02, an over-pruning transliteration passes both. See 18-02.
- LOW: the acceptance line "`rg -n 'killer|shipHit|...try \{' src/sim/combat/collide.ts`" is a text grep, so a `try` hidden by formatting such as `try{` evades it.

**Suggestions.** Recursion plus completeness property.

### 18-10

**Summary.** The player's drift vector, braked by raw thrust with the cleanup terms, pristine-omit in the flight hash.

**Strengths.**
- Zero drift writes nothing, so every flight-hash pin holds. Pose-reset sites are enumerated, and `sanitizeFlightState` repairs and clamps before the step integrates (T-18-23).
- The no-tunnel case at 350 m/s and the one-bounce-in-600-ticks case guard the station contact.
- Fixtures of `braking-player.json` are run against the port.

**Concerns.** No findings in focus.

**Suggestions.** None.

### 18-11

**Summary.** The opt-in collision stage for the player, NPCs, pods and plates, with kills and debris through the one kill path.

**Strengths.**
- Opt-in flag never set by the acceptance harness, so frozen worlds stay byte-identical.
- The 600-tick "damage once per contact" case, the DOCK-09 byte-identical dock with and without collisions (at zero and non-zero drift), and a both-lethal ram that pins the credit outcome.
- A NaN sweep key sorts after every finite key, so the comparator is a total order (T-18-49).

**Concerns.** No findings in focus.

**Suggestions.** None.

### 18-12

**Summary.** Phase close: todos, the FIDELITY walk, tripwire evaluation, the only `verify-full`.

**Strengths.**
- It re-runs the synthetic positive cases of the new tripwire.
- It records the open owner question that no gate runs the 20 frozen seeds with collisions on, which honestly states what QUAL-11 does not cover.

**Concerns.** LOW: `depends_on` is 18-19, 18-20, 18-21 and 18-22, but 18-18 (the tripwire guard and todo it evaluates) is only transitive. That works, but name it.

**Suggestions.** None.

### 18-13

**Summary.** The static artifact joins the traffic-gated boot `Promise.all`; the merged hull table; `fullHullTable()`; the twins; a size row.

**Strengths.**
- The `budget.spec.ts` regex gap is understood (`tests/e2e/budget.spec.ts:326` matches only `ships-hulls-*.js`) and covered by a unit scan plus 18-22.
- The twins use `fullHullTable()`, with an equality case against `hullTable(...)`.

**Concerns.**
- MEDIUM: the load-failure path is claimed as pinned "exactly as a rejected `loadShipHulls()` does in `tests/app/session/start-session.test.ts` (the T-16-19 cases near lines 579-600)". Those cases are source scans, not runtime tests: the file says it "has no Node harness" (`tests/app/session/start-session.test.ts:560-563`) and the cited block (569-600) asserts ordering inside the `Promise.all` and that `showBootFailure` appears after it. There is no existing test that makes a loader reject and observes the failure surface. The behaviour line "a traffic-on boot whose `loadStaticHulls()` rejects ends on the visible boot-failure surface with the reason" therefore cannot be written "exactly as" an existing case. The executor will either add only a source-shape scan (which proves wiring order, not that a rejection reaches `catch`) or build a new harness. Say which, and prefer a real test of the `catch`.
- LOW: the same test file has `expect(source).toContain("hullTable(hullCatalogue)")` (start-session.test.ts:~575) and `source.match(/loadShipHulls\(\)/g)` length checks. Passing the static artifact changes that call, so the plan must update these assertions. It lists the file but does not name them.
- LOW: `hullCatalogue` and the static artifact load under the same flag, but nothing asserts they cannot be `undefined` independently (a test that sets one and not the other).

**Suggestions.** Specify the failure test shape; update the `hullTable(hullCatalogue)` assertion.

### 18-14

**Summary.** `World.buoys` (offset, velocity, subentity energy, sticky routing flag), pristine-omit in the hash and snapshot, bounded parser and a sanitiser.

**Strengths.**
- The state is as small as the decisions need, the hash line prints only when non-pristine, and the snapshot key is optional with a pristine default, so every golden stays valid.
- The parser rejects non-finite values, out-of-range energy, a non-boolean flag, a flag set on a detached subentity, a missing buoy and unknown keys, naming the path.
- The Key Decisions amendment lands in the same commit as the hashed field.

**Concerns.**
- MEDIUM: `hashWorld` repairs state itself because it is read by callers that never step. `src/sim/world/serialize.ts:228-233` documents that `sanitizeStaticHealth(world)` runs inside `hashWorld` to reach "the `?test=1` probe's `worldHash` (`probe-publisher.ts:171-179`) and the acceptance detectors". 18-14 places `sanitizeBuoyStates` only in `repairWorldFields` in `src/sim/world/step.ts:278-288`. `canon` throws on a non-finite number (`src/sim/hash.ts:30-32`), so a poisoned `buoys` (a hook or a bug in the collision stage) reaches `hashWorld` through the probe or a detector and throws. The ledger defers L743 ("the sanitiser runs only in stepWorld") with "the parser rejects the same values on restore". That addresses restore, not a live in-memory write followed by a hash. Fix: call `sanitizeBuoyStates(world)` in `hashWorld` before `isPristineBuoyStates`, beside `sanitizeStaticHealth`, and add a hash-without-step case.
- LOW: T-18-39 names "sanitizeBuoyStates before every hash", but the plan text implements it only before a step (see above); the threat model overstates.
- LOW: the offset bound is per component (1e6). That is fine for DoS, but the stage's writes (18-18) must clamp to the same constant, or a legitimate state would fail the parser on restore through the `?test=1` hook. 18-18 does say it clamps at `MAX_BUOY_OFFSET`.

**Suggestions.** Sanitise in `hashWorld`; add a case that hashes a poisoned world without stepping.

### 18-15

**Summary.** The buoy subentity as a laser target with sticky bleed-through routing, recharge and detachment; pods and plates as candidates.

**Strengths.**
- The sticky rule matches the C. `Universe.m:5631-5637` sets `setSubEntityTakingDamage` only when the winning entity is a subentity of the winner; `ShipEntity.m:10202-10209` reads the stored sub, not the current hit. A test for the "hull beam after a subentity hit still routes 1 % + full" case is in the behaviour list, so the plan's rule can fail on wrong behaviour.
- The 14-hit detach case (200 / 15) and the 15th beam after detachment are tested.
- A cadence case covers recharge at 30, 60 and 144 Hz.

**Concerns.** LOW: the flag is set at queue time in `resolveShotHits` (a world write from the shot resolver). If the record is later skipped (a destroyed buoy in the same tick), the flag stays set on a buoy that is gone. The plan calls it inert; add a one-line test that a destroyed buoy's flag is not hashed (it is not in the hash because `subentityTakingDamage` prints with `isPristine`; see 18-14).

**Suggestions.** None.

### 18-16

**Summary.** `collideWithShip` and `routeScrapeDamage` as pure kernels held to the response oracle.

**Strengths.**
- It runs every 18-03 collide and scrape fixture against the port and adds fast-check totality with NaN/Infinity/1e308.
- A negative grep keeps `routeDamage` (the heating path) out of the response (T-18-22).

**Concerns.** No findings in focus (oracle independence concerns are in 18-03).

**Suggestions.** None.

### 18-17

**Summary.** NPC and buoy drift integration and braking.

**Strengths.**
- A world with all-zero velocities writes nothing, so the golden and cadence tests stay identical.
- The braking-npc fixtures are run, and a drifting Krait and buoy hash equal at 30/60/144 Hz.
- Clamps at write for non-finite input (T-18-24).

**Concerns.** No findings in focus.

**Suggestions.** None.

### 18-18

**Summary.** Buoys as colliders and movers, subentity contact rule, cadence, cost counters, totality properties, and the player-death tripwire.

**Strengths.**
- The cost test pins deterministic counters (`narrowTests`, `sweptPairs`) rather than a wall time, which is the right way to avoid a flaky performance gate.
- The totality property feeds NaN, Infinity and 1e308 into positions, velocities and buoy offsets.
- The tripwire is a pure function over (path, text) pairs with four inputs: the current tree, two synthetic producers, and the bare declaration. I verified it against the current tree: `rg 'kind: "playerDestroyed"' src` matches only `src/sim/events.ts:179`, and `"playerDestroyed",` at `:227` is a list entry with no `kind:` key. `FlightMode` is `"docked" | "launching" | "inFlight"` (`src/sim/flight/state.ts:18`), with no `"dead"` member. The guard passes on the current tree as claimed.

**Concerns.**
- MEDIUM: the producer key is narrow. Phase 20's death path can name its mode `"destroyed"`, `"exploding"` or `"gameOver"`, or emit through a helper (`emit("playerDestroyed", ...)`, a spread, or `kind: "playerDestroyed" as const` assigned to a variable). None of those match `kind:\s*"playerDestroyed"` outside `events.ts` or the exact member `"dead"`. Key the mode check on the whole union (the guard fails if `FlightMode` gains any member), and key the event check on any `"playerDestroyed"` string literal in `src/sim` outside `events.ts` and outside comparisons (`=== "playerDestroyed"`, `case "playerDestroyed":`).
- LOW: the detached-buoy collision mass is `NAV_BUOY_MASS - BUOY_SUBENTITY_MASS` = 691,044.4013671875 (double). The C holds a float: 691,044.375 (see 18-07). The player-against-buoy ram is where this enters the oracle comparison; use the float value so the 18-03 `Math.fround` fixtures and this test agree to the last bit.
- LOW: the "real-engine evidence" comparison against 18-20 is a SUMMARY note ("a difference beyond one tick of travel is a dispute"). Nothing fails if the note is skipped. Make it an assertion in `collision-buoy.test.ts` against a constant read from 18-20's recorded value, or state it as a human gate.

**Suggestions.** Broaden the tripwire as above; use the float mass.

### 18-19

**Summary.** The explosion blast pushes ships, buoys and the player; every exploding body is a source.

**Strengths.**
- Expected values are the 18-03 fixture file; the plan states no figure of its own.
- Re-pinning a moved value is allowed only with the source, receiver, distance and predicted value named, otherwise the plan stops.
- The station is never a receiver (T-18-32), and the clamp at write applies at the 0.1 floor (T-18-31).

**Concerns.** No findings in focus.

**Suggestions.** None.

### 18-20

**Summary.** PD-03: measure the dock mouth, the buoy ram and the pod/plate blockage radius on real Oolite, with verdicts in FIDELITY.md.

**Strengths.**
- A MISMATCH never edits a fixture, tolerance or port; consumers carry a precondition and a `depends_on` edge. Outputs stay out of the repository (T-18-46).
- "Unobservable" is recorded as unobservable with the API source checked.

**Concerns.**
- LOW: the gate is the absence of `.planning/todos/pending/2026-11-19-oolite-measurement-mismatch.md`. If an owner resolves a mismatch by moving the todo to `completed/` without the fix landing, or 18-20 skipped a claim as "unobservable", the consumers' preconditions pass silently. Add a positive marker the consumers also check (the 18-20 SUMMARY exists and its verdict table has no MISMATCH row).
- LOW: claim (1) compares dock-mouth hit distances with fixtures whose tolerance is the leaf half-diagonal. The real engine returns the first-leaf centre distance, so the comparison is only as good as the 18-02 tolerance (see the 18-02 MEDIUM on oblique rays and clearances). If 18-02 is tightened, 18-20 should use only the tightened fixtures.

**Suggestions.** A positive gate marker.

### 18-21

**Summary.** PD-06: live buoys join the NPC proximity pass; QUAL-11 rerun with PD-07's accept-and-record rule.

**Strengths.**
- It has a control run (the same course with the buoy destroyed passes through the buoy's position), which proves the avoidance comes from the alert, not from chance.
- The view returns the layout position unchanged for a zero offset, and the diff gate keeps `tests/acceptance` and `tests/golden/world` untouched.
- The stop condition is a threshold failure, not a changed number (PD-07).

**Concerns.**
- LOW: T-18-53 says the view change protects the frozen worlds, but PD-06 itself says NPCs in those worlds may steer differently. The two statements pull in different directions. The `git diff --quiet tests/golden/world` gate in this plan's acceptance criteria could then fail on a legitimate change (the populated Lave golden). State in the plan which goldens may legitimately move and what the executor does if one does: stop and report, as for a threshold failure, not edit.
- LOW: the QUAL-11 pass proves thresholds hold, not that steering is Oolite-faithful. Its evidence for the avoidance itself is the single-course unit test. Add a second geometry (offset buoy at a non-zero `World.buoys` offset, which the behaviour list mentions only as an alert case).

**Suggestions.** Name the golden-moves procedure.

### 18-22

**Summary.** A new traffic-on browser spec: a shot-at nav buoy leaves the scanner; ident locks the station; the static chunk loads only with traffic on.

**Strengths.**
- It fills a real gap: the e2e bundle defaults to traffic off, where none of the static hulls load. Without this spec no browser test exercises the headline criteria.
- It uses only existing probe fields and hooks (I confirmed `contacts` and `identLocked` at `src/app/probe.ts:67-68,418` and the hooks at `:384-387`) and adds none; the diff gate on `src/app/probe.ts` backs that.
- The firing loop is bounded by a tick count and prints the last contacts on failure (T-18-55).
- Arithmetic check: the pulse laser (`src/sim/combat/constants.ts:75-81`: damage 15, shot temperature 7, cooling 6 per second, cutout at 0.85 x 256) heats about 8 per second at two shots per second, so roughly 28 s of fire before cutout. The nav buoy needs about 14 subentity hits plus 17 hull hits (about 16 s), so overheating does not defeat the loop.

**Concerns.**
- LOW: the "gone from contacts" assertion cannot tell destruction from another cause (the buoy leaving scanner range, or a scene reset). Also assert a `shipDestroyed` event or the static health reaching 0 through an existing probe field, if one exists; otherwise note the limitation.
- LOW: with traffic on, NPCs spawn and may shoot the player or cross the line of fire during the run. The plan does not pin the seed or the NPC count. A flake here would be a spec failure with a misleading message. Pin the `?seed` if the test URL supports it, or retry the park-and-fire once.
- LOW: the plan asserts "exactly one `/assets/ships-static-hulls-*.js` chunk" with traffic on. If Vite splits or renames the chunk in the `build:e2e` bundle, the spec fails for a reason unrelated to behaviour; copy `budget.spec.ts`'s regex shape (the plan does) and record the observed filename in the SUMMARY.

**Suggestions.** Add a destruction-specific assertion; pin the seed.

### Cross-plan comparison

- Dependencies: the `depends_on` graph is acyclic and ordered (waves 1-13). The 18-20 gate is carried by `depends_on` plus a precondition in 18-04, 18-07, 18-09 and 18-16; the weakness is the absence-of-file marker (see 18-20).
- Persistence: the saves stay unchanged (`git diff src/persistence` gate in 18-14). The only snapshot change is the optional `buoys` key. The weak point is the `hashWorld` repair (see 18-14).
- Oracle independence: mechanical import guard plus a process rule. The replan removed `18-RESEARCH.md` and figures from 18-02's reading list, but 18-03's behaviour list still shows figures, and the 18-02 reference and the 18-09 port share the same recursion error.
- Tests that would fail on wrong behaviour: every success criterion has one. Criterion 2 (laser stops at the station, a buoy dies and leaves the scanner) has 18-04, 18-05 and 18-22. Criterion 3 (ident) has 18-06 and 18-22. Criterion 4 (collisions once per contact, kills with debris, station damage-free, no overlapping pose) has 18-09, 18-11, 18-16, 18-18 and 18-07's sweep. Criterion 5 (pristine hash, 30/60/144 Hz) has the cadence tests in 18-14, 18-17 and 18-18. The one criterion half without a runtime browser proof is "removed from the 3D view": unit-level only.
- Threat models are realistic and short. The ones that overstate are T-18-39 (see 18-14) and T-18-53 (see 18-21).

### Overall

**Risk Assessment: MEDIUM.**

The replan fixed the structural problems of round 1: ledger rows I checked have matching executable text (the sticky routing, the producer-keyed tripwire, the load-failure case, the split `dvOther`, the subentity bleed rule). None of my findings is a blocker in the sense that it breaks the build, but seven would cause either a stop-and-dispute during execution (the 18-02 tolerance, the stage-4 shadowing) or a latent defect in the delivered state (the missing `hashWorld` repair, the weak load-failure test and tripwire keys).

Priority order for a fix pass:
1. 18-14: repair `World.buoys` inside `hashWorld`.
2. 18-02: incidence limit and miss clearance, per-fixture role flips, completeness property, recursion in `doOctreesCollide` (and 18-09's matching text).
3. 18-13: state the load-failure test shape and the assertions to update.
4. 18-18: broaden the tripwire keys; use the float32 detached mass here and in 18-07.
5. 18-03: remove expected figures from the behaviour list or correct the ledger.

---

