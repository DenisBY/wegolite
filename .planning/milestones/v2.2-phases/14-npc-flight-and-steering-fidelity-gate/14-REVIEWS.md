---
phase: 14
round: 2
reviewers: [claude-opus-A, claude-opus-B, claude-opus-C]
reviewed_at: 2026-11-15
plans_reviewed: [14-01-PLAN.md, 14-02-PLAN.md, 14-03-PLAN.md, 14-04-PLAN.md, 14-05-PLAN.md, 14-06-PLAN.md, 14-07-PLAN.md, 14-08-PLAN.md, 14-09-PLAN.md, 14-10-PLAN.md, 14-11-PLAN.md, 14-12-PLAN.md, 14-13-PLAN.md, 14-14-PLAN.md, 14-15-PLAN.md, 14-16-PLAN.md, 14-17-PLAN.md, 14-18-PLAN.md, 14-19-PLAN.md]
models:
  claude-opus-A: "claude-opus (subagent, read-only)"
  claude-opus-B: "claude-opus (subagent, read-only)"
  claude-opus-C: "claude-opus (subagent, read-only)"
model_sources:
  claude-opus-A: "agent model override"
  claude-opus-B: "agent model override"
  claude-opus-C: "agent model override"
supersedes: "round 1 (REVIEWS.md at 7b15bb3); all round 1 findings were ruled on in the plan ledgers"
---

# Cross-AI Plan Review — Phase 14, round 2

Three independent Claude (opus) reviewers, each read-only, split by plan group: A = 14-01..07, B = 14-08..15, C = 14-16..19 plus a whole-phase assessment. No external CLI was used (owner request: use Claude models). Reviewers verified the revised plans (19 plans, 14 waves, HEAD `bc56f55`) against the repo and the Oolite checkout. The checkout HEAD is `4bb1f53de`, not the pinned `7437f22`; `git diff 7437f22 HEAD` is empty for `ShipEntity.m`, `ShipEntityAI.m`, `ShipEntity.h` and `CollisionRegion.m`, so cited line numbers hold (about 100 citations spot-checked across the three reviewers, all accurate within +-3 lines except one wrong path in 14-01). Round 1 history is in git (`7b15bb3`); only findings are kept here.

## Reviewer A — plans 14-01 to 14-07

### 14-01 (oracle I, part 1) — risk MEDIUM
- MEDIUM: float32 versus float64 accumulator divergence. `frustration` is GLfloat (`ShipEntity.h:337`). Accumulating 1/120 in float32 versus float64 moves some event ticks by one: 0.5 s -> tick 61 vs 60 (evasive follow-on, `ShipEntity.m:4023`), 10.0 -> 1201/1200, 7.5 -> 901/900, 12.5 -> 1501/1500, 9.375 -> 1126/1125 (face destination `15/max_flight_pitch`, `ShipEntity.m:4946`, for pitch 2.0, 1.2, 1.6). Checks have a tolerance, `events` do not; contract item 6 ("move the pose away from the threshold") cannot work for a time accumulator. Fix: port stores frustration as `Math.fround`, or the contract defines how accumulator-threshold events are checked (`14-01-PLAN.md:106,110`).
- MEDIUM: the tracking-curve sample tick is ill-defined. The gate is `trackingCurveTimes[0] + reactionTime/3.0 > now` (`ShipEntity.m:5448`) and `universal_time += delta_t` (`Universe.m:6456`) is a double sum: 60 steps of 1/120 from 0 give 0.5000000000000007 (sample at tick 60), from a base of 1000.0 they give 0.49999999999954525 (tick 61). The contract does not say which "now" a tick-k `aimPoint` check uses; 14-02 checks ticks 59/60/61, straddling the edge (`14-01-PLAN.md:108`, `14-02-PLAN.md:112`).
- LOW: contract `stats` has no `scannerRange`; the steering reads it at `ShipEntity.m:8706`, `:4775`, `:5038`. State the default 25600.
- LOW: proximity order "ascending id, last writer wins" is not Oolite's collision-chain order (`CollisionRegion.m:286-312`); record as a divergence.
- LOW: wrong read_first path `src/Core/OOMaths/OOQuaternion.m`; the file is `src/Core/OOQuaternion.m` (`14-01-PLAN.md:122`).

### 14-02 (oracle II: pursuit and attack) — risk MEDIUM
- MEDIUM: losing the target in intercept posts two events, not one: `rangeToPrimaryTarget` returns 0 with the target gone (`ShipEntity.m:9727`), so `shipAchievedDesiredRange` is posted (`:3822-3825`) before `trackPrimaryTarget` -> `noteLostTargetAndGoIdle` -> `shipTargetLost` (`:9038-9041`, `:8792`). The plan lists only `shipTargetLost` (`14-02-PLAN.md:112`).
- MEDIUM: the 0.5 s evasive follow-on falls on tick 61 (float32) or 60 (float64); `derive.ts` must pick one and a port of the other width fails a correct oracle (`14-02-PLAN.md:161`, `ShipEntity.m:4021-4028`).
- LOW: `aimPointX` checks at ticks 59/60/61 sit on the sampling edge (`14-02-PLAN.md:121`).
- Verified correct: Shuttle weapon range 0 and the fly-from bounce, performFlee draw order, nearby gated by `!pitching_over`, SIX aspect < 0 at 4164.

### 14-03 (content flight fields) — risk LOW
- No defects; values, defaults, hand-written golden and the NpcShip/BodyView literal sites check out.

### 14-04 (AI-11 spike) — risk LOW-MEDIUM
- MEDIUM: the reconsider model is wrong. The priority AI does not reconsider through `Timer`: `_resetReconsideration` writes `ship.AIScriptWakeTime` (`oolite-priorityai.js:230-239`, random delay `:578`) and the engine later calls the AIScript's `aiAwoken` (`:259`). The stub host must compare the clock with `AIScriptWakeTime` and call `aiAwoken` through `callInContext` (`14-04-PLAN.md:114,138`).
- LOW: the isolation guard walks `vite.config.ts` and `vite.e2e.config.ts` but not `vite.seams.config.ts`.

### 14-05 (BodyView.radius) — risk LOW
- No defects. LOW: if 14-12 forgets the wiring, `playerRadius = 0` silently; 14-12 pins it with a grep, acceptable.

### 14-06 (oracle I, part 2: rate rule, avoid, escort) — risk HIGH
- HIGH: the parallel-offset avoid fixture can never raise the alert. `setProximityAlert:` alerts only when d2 <= (2*r_self + r_other)^2 (`ShipEntity.m:6125-6129`); the lateral offset is a lower bound on d and 2(r1+r2) > 2*r_self + r_other always, so no alert, no entry values, no resumption tick exist. With equal radii the pair trigger sits exactly on its `<` threshold (`CollisionRegion.m:309`). Use an offset between r1+r2 and 2*r_self + r_other (`14-06-PLAN.md:139`).
- MEDIUM: the `crossDtTolerance` 0.01 rad derivation assumes the 0.99999 cap; `max_cos` reaches the cap only when range/desiredRange >~ 210. For range <= desiredRange it is `MAX_COS` = 0.995, about 0.1 rad (`ShipEntity.h:142`, `ShipEntity.m:9465-9491`). Unless grid poses are constrained to range >> desiredRange, dead-band artefacts show up as frame-rate divergence rows (`14-06-PLAN.md:115`).
- LOW: "station within 2000 m ahead alerts self" holds only near full speed (forward stretch `0.25*max/speed`, `ShipEntity.m:6124`); the no-leader escort reaches `noteFrustration` only if distance stops improving (`:5030-5038`). State both pose conditions.
- LOW: the 60-tick rule `round(s*120)` papers over Oolite's tick 60 or 61; record a measured divergence row.

### 14-07 (dist check and acceptance thresholds) — risk HIGH
- HIGH: the frozen script mapping makes intercept unreachable for a faithful port. Ships sit on lanes (`populate.ts:93-104`); in the epoch-1 golden ships 102 and 107 (intercept) are about 290 km and 550 km from the station-side cluster where the player is parked 6 km from the station. A faithful port loses the target on the first update beyond 1.25 x scanner range = 32 km (`ShipEntity.m:8705-8708`, `:9043-9046`), goes IDLE with `desired_speed = max*0` (`:3826`): zero net progress, so `MAX_STUCK_WINDOWS = 0` is breached on probably every seed, and the file cannot be edited after its commit. Flee flyers starting beyond 25.6 km from the player meet their goal at t0 (vacuous detector). Fix before freezing: a start-placement rule (runner moves targeted flyers to a fixed offset from the player) or a distance-based mapping (`14-07-PLAN.md:80-85`; `14-17-PLAN.md:27`).
- MEDIUM: the pre-declared resolution recommends option (c) "port defect" for every `other` crossing, but in Oolite flee ignores all alerts when accuracy < 0 (about half of stock ships, `ShipEntity.m:4898`) and 14-06's own head-on derivation shows a faithful port can pass through a hull at closing speed. Some `other` crossings are faithful; the class split pushes the executor toward forbidden tuning (`14-07-PLAN.md:88`).
- LOW: Task 1's remote `verify` syncs the committed HEAD while 14-06 (same wave) may have committed partial oracle work (`14-07-PLAN.md:77,126`).
- Verified correct: marker reasons and the absence of the three new markers; chain pins (`container-contract.test.ts:364,377,422`); `pages.yml:37`; `tsx` devDependency.

### Cross-plan (A)
- The float32/float64 accumulator gap affects 14-01, 14-02 and 14-06 together; decide once in the contract whether the port emulates GLfloat for `frustration` (and `desired_range`/`desired_speed`, `ShipEntity.h:194-195,337`).
- The 14-07 acceptance design and the 14-06 head-on derivation contradict each other on whether `other` crossings are defects.
- Dependencies, shared files and `files_modified` are fine; no scope creep.
- Round 1 confirmed fixed: import guard, applySticks fixture, tolerance stated before measurement, event cadence, performFlee reachability and RESEARCH:315 gate, nearby draws, SIX aspect, Shuttle range 0, golden hand-edit, vm contexts, marker set, thresholds definitions, `STATION_RADIUS_M`, second escort fixture, 14-07 dependency. Open or new: parallel-offset geometry (HIGH), hull-crossing class resolution (MEDIUM), frame-rate tolerance (MEDIUM), float32 handling (new), shared-misreading limit (acknowledged only).
- Verdict: not ready; fix the 14-07 placement/mapping HIGH before the thresholds freeze, the 14-06 parallel-offset HIGH, and the float32 accumulator rule.

## Reviewer B — plans 14-08 to 14-15

### 14-08 (steering record, snapshot v3) — risk LOW-MEDIUM
- MEDIUM: the record's domain allows states where `calculateTrackingCurve` divides by zero: with `trackingCount` 4, ticks that are not strictly decreasing give t1 = 0 or t1 = t2 (`ShipEntity.m:5476-5486`). Neither sanitiser nor strict parser enforces `ticks[0] > ticks[1] > ticks[2] > ticks[3]`; a forged v3 snapshot passes parsing and NaN aim points become counted repairs; the property generators can produce such states. Fix: ordering invariant in sanitiser and parser (repair to count 0); generators draw domain-valid records only (`14-08-PLAN.md:90,145,172`).
- LOW: "random finite steering records" (`14-09-PLAN.md:197`) must also mean domain-valid (accuracy outside [-5, 10] that is not the sentinel is repaired, breaking "sanitizeEntity repairs nothing").

### 14-09 (flight-model tracer, steering contract) — risk LOW-MEDIUM
- LOW: the out-of-scope fallback runs idle plus thrust ramp for ENERGY_BOMB_COUNTDOWN and TRACK_AS_TURRET, where Oolite turns thrust off (`applyThrust = NO`, `ShipEntity.m:2614,2628`); TRACTORED differs too. Name these in the 14-19 divergence list (`14-09-PLAN.md:37`).
- LOW: the contract does not state that `vector_normal` returns the zero vector for zero input (`OOVector.h:270-273`); `approachAspectToPrimaryTarget` (`ShipEntity.m:9745`) depends on it.
- LOW: the frame note does not cover the jink offset in `trackPrimaryTarget` ("vz = body forward is local -Z", `ShipEntity.m:9067-9104`).

### 14-10 (trackDestination, fly-to, face) — risk LOW
- LOW: the `Math.trunc` rule covers only trackDestination (9526, 9538, 9550); `trackPrimaryTarget` has the same `int factor` truncation at 9178, 9187, 9197 and 14-12 does not state it (`14-12-PLAN.md:35,122`).

### 14-11 (world step uses steerShip) — risk MEDIUM
- MEDIUM: `massFor` falls back to `massOf(facts.masses, ...)`, which is module-private in `src/sim/world/ship-field.ts:128` and the file is not in `files_modified`; export it (and list the file) or copy the scan (`14-11-PLAN.md:104,125`).
- MEDIUM: `playerRadius` comes from `options.combat.hulls`, documented "Absent until the lazy file has loaded" (`src/sim/combat/step.ts:54-58`). The player's `BodyView.radius`, hence ranges, flee/attack decisions and the player's proximity zone, would depend on asset-load timing; browser-vs-Node replay parity and steered hashes become timing-dependent. Use a compiled constant (Cobra Mk III collision radius) or record the dependency (`14-11-PLAN.md:105,125`).

### 14-12 (sensing, tracking curve, intercept) — risk MEDIUM
- MEDIUM: self-targeting is unhandled. `setTarget` accepts the actor's own id (`control-impl.ts:58-61`); `isValidTarget` would start a curve on self. Oolite ignores `addTarget:self` (`ShipEntity.m:8661-8662`) and drops a self reference in `primaryTarget` (8724-8730). Treat `targetId === entity.id` as invalid (`14-12-PLAN.md:33,102`).
- LOW: `noteLostTargetAndGoIdle` also sets frustration to 0 (`ShipEntity.m:8798-8803`); the plan omits it.
- LOW: "the jink is zero until flee sets it in plan 14-13" is wrong: the retreat branch of `trackPrimaryTarget` itself calls `setEvasiveJink:400` when accuracy >= FLEES_BETTER and jink.x == 0 (9093-9095); 14-13 Task 2 never wires it (`14-12-PLAN.md:122`; `14-13-PLAN.md:137`).
- LOW: `addTarget:` posts `shipTargetAcquired` (8667-8669), not in `AI_EVENT_NAMES` and not recorded as a divergence.
- LOW: ledger row says `test-pilot.test.ts` is in 14-12 `files_modified`; it moved to 14-05 (ledger text only).

### 14-13 (avoid entry and exit, flee, evasive) — risk LOW-MEDIUM
- LOW: `performFlee` immediate part must also set FLEE_TARGET (only implied); a guarded no-op (behaviour already FLEE_EVASIVE_ACTION) should clear an earlier pending entry under "last perform wins".

### 14-14 (attack dispatcher and sub-behaviours) — risk MEDIUM
- MEDIUM: the must_have "an unarmed attacker alternates ATTACK_TARGET and ATTACK_FLY_FROM_TARGET every tick" holds only when jink.x <= range/15: fly-from's exit test is `range > 0*weaponRange + 15*jink.x` (`ShipEntity.m:4775`) and the unarmed branch (4098-4099) never zeroes jink. A Shuttle with accuracy >= 0 that fled earlier carries |jink.x| 128..255 and retreats up to about 3.8 km first; negative jink.x exits at once. Task 3 correctly says "with zero jink"; fix the must_have and do not let 14-16/14-17 rely on the general claim (`14-14-PLAN.md:30`).
- MEDIUM: the plans never say how `[target primaryTarget] == self` is read for an NPC target (matters at 4119, 3920, 4658, 4669). Should be `view.ship(target).targetId === self`, kept only while that target's own target is valid (`14-14-PLAN.md:82`).
- LOW: the ledger names only the 12,500 m sniper range; the sniper also uses 15,000 m (bounce back to ATTACK_TARGET), `scannerRange x 0.8` and `setEvasiveJink:1000` (4413-4444). Beam lasers (range 15000: Gecko, Krait, Viper) make the sniper reachable with stock accuracy between 12.5 and 15 km.

### 14-15 (proximity pass, avoid, escort) — risk HIGH
- HIGH: the new parallel-offset case cannot raise an alert in a faithful port: `setProximityAlert:` alerts only if d^2 <= (2*r_self + r_other)^2 (`ShipEntity.m:6119-6125`); the forward stretch scales only d_forward so d^2 >= lateral^2 = (2(r1+r2))^2, always larger; for two Vipers the pair trigger also fails (dist < 4*max(r) = 4r = offset, strict `<`, `CollisionRegion.m:304-305`). Asserting "the alert tick from the closed form" pushes the executor to an oracle dispute or forbidden tuning (Pitfall 6). Same defect in `14-06-PLAN.md:139`. Use an offset below 2*min(r) + max(r), e.g. 1.5*(r1+r2), and keep the clearance claim as observed; or assert "no alert" at 2(r1+r2) as a negative case (`14-15-PLAN.md:36,119`).
- MEDIUM: "keeps retreating from the last midpoint" is wrong: while an alert exists `behaviour_avoid_collision` sets `_destination = prox_ship->position` every tick (5160-5163) and the pass re-raises the alert each tick inside the zone; after the alert clears the ship retreats from the other ship's last known position. Same wording in `14-06:139` and T-14-26 (`14-15-PLAN.md:35,119,204`).
- LOW: followers with a lower id than their leader steer before the leader's refresh and read the previous tick's destination; add to recorded divergences (`14-15-PLAN.md:144,172`).
- LOW: the gate `rg 'world\.store'` in dispatch.ts is weak; steering could reach the store through another module such as escort.ts (`14-15-PLAN.md:153`).

### Cross-plan (B)
1. HIGH: the 14-06 and 14-15 parallel-offset fixture and test cannot alert in Oolite; fix both together.
2. MEDIUM: tracking-curve tick ordering is not enforced (14-08); property generators in 14-09/14-12/14-13 draw domain-valid records only.
3. MEDIUM: the player radius comes from lazily loaded hull data (14-11 -> 14-12/14-15/14-18); use a constant or record it.
4. MEDIUM: target-of-target for NPC targets is unspecified (14-12/14-14).
5. Divergences to add to 14-19: self-target, `shipTargetAcquired` not posted, fallback thrust for the no-thrust ids, the avoid destination after alert loss, follower-before-leader order.
6. No wave or `depends_on` holes; `files_modified` complete except `src/sim/world/ship-field.ts` in 14-11.
- Round 1 fixed: every Reviewer B item for the old 14-07..13. Still open: the head-on/clearance concern (replacement test is itself unreachable).
- Verdict: phase goal reachable; fix the 14-15 and 14-06 parallel-offset case before execution, and the MEDIUM items before or during their plans.

## Reviewer C — plans 14-16 to 14-19 and whole phase

### 14-16 (flight-script pilot, spawnTestFlyers, flyers scenario, cadence) — risk LOW-MEDIUM
- MEDIUM: the station-flyer assertions will probably pass vacuously. The player is placed with `poseNearFirstShip` next to ship 101 (`tests/helpers/traffic-fixture.ts:75-89`), which comes from the first `INERT_POPULATION` entry `LANE_WP` (`src/sim/world/populate.ts:95`), probably far from the station. The scenario lasts 3,600 ticks (30 s); a Shuttle at 80 m/s covers about 2.4 km. "Never enters the 500 m sphere" and "never holds an alert naming the station" (`14-16-PLAN.md:110`) hold without the flyer reaching the station. Spawn near the station or assert the station flyer reaches `"done"`. Task 1 also never names which three records the scenario uses (14-18 names shuttle, viper, adder).
- LOW: "FLEE_TARGET after its first update" (`14-16-PLAN.md:32,110`) does not say which tick; perform entries are deferred (`entryPending`) and the first think runs at the spawn tick.
- LOW: `FLYER_SCRIPT_RANGES` as a plain exported object literal breaks lint: `AI_MODULE_STATE_BANS` bans an exported const object/array/`new` (`eslint.config.js:289-292,602-610`). Use `Object.freeze(...)` or scalar constants.
- Confirmed: flee aspect claim (`ShipEntity.m:9746-9748`), `AI_KEYS` vocabulary, `BEHAVIOUR_IDS` import allowed.

### 14-17 (20-seed acceptance) — risk HIGH
- HIGH: the recommended answer (a), accepting `own-target` crossings as a recorded divergence, has no way to make the run pass. With (a), `thresholds.ts` keeps `MAX_HULL_CROSSINGS = 0` (`14-07-PLAN.md:88`) and every epoch asserts every count against its threshold (`14-17-PLAN.md:149`), so `npm run test:acceptance` stays red for good; Task 2's verify fails (`:155`), the rerun in 14-19 Task 2 fails (`14-19-PLAN.md:141-142`) and `14-VALIDATION.md:32` requires that rerun green before verify-work. The plans say a faithful attacker is likely to cross the parked player's hull (`14-17-PLAN.md:89`). Settle the encoding now: e.g. the epoch assertion compares `other` against 0 and `own-target` against a committed per-seed list of accepted crossings written by the 14-19 decision row, or (a) is `it.fails` per seed with the reason recorded.
- MEDIUM: answer (b) contradicts the automated freeze check: (b) adds a second commit to `thresholds.ts` that becomes "the new recorded hash" (`14-17-PLAN.md:149`) while the check requires exactly one commit, `wc -l -eq 1` (`:152`).
- MEDIUM: no check that the risky situations actually happen. By table order `SCRIPT_MAPPING` (`14-07-PLAN.md:80`) assigns station flyers to 101 (`LANE_WP`) and 107 (`LANE_PS`), interceptors to 102 and 108 (lanes), the escort 111 to leader 107 on `LANE_PS`; only fleer 103, attacker 110, escort 111 and face 112 start at the station aegis. Many seeds may never bring a flyer near the station sphere or the interceptors close on the parked player within 150 s, so stuck, sphere and hull checks pass without testing anything. Clearances and goal ticks are only informational (`14-17-PLAN.md:149`). Add run-level minimums to `thresholds.ts` before freezing (e.g. at least one station-goal arrival and at least N flyer-ticks within 1 km of the player across the 20 seeds).
- MEDIUM: the plan is `autonomous: true` (`:13`) yet plans a likely owner stop (`CHECKPOINT REACHED`, `:89`) with no checkpoint task: a hidden third owner gate (ROADMAP says two); auto-advance may treat it as a failure.
- LOW: a detector false positive has no route out (detectors cannot be edited after their commit; escalation options cover only port defects). Add a "detector defect -> owner" option.
- LOW: Task 2 may fix files under `src/sim/npc/` not in `files_modified` (`:7-12`); the plan says to list them in the summary, acceptable.
- Confirmed: the run is outside the default suite (`*.acceptance.ts` vs `*.test.ts`, `vitest.config.ts:77-81`); config is typechecked; contract test reads scripts by name; the step sanitises every tick (`step.ts:134`); attackers never fire (`control.ts:41`).

### 14-18 (session wiring, hook, opt-in smoke) — risk MEDIUM
- MEDIUM: "scanner ship contacts are the populated count plus 3" (`14-18-PLAN.md:180`) is probably wrong just after launch: most populated ships sit on lanes, likely outside 25.6 km of the station. The existing traffic spec computes visible contacts from the HUD model (`tests/e2e/traffic.spec.ts:567-590`). Measure contacts just before the spawn and expect that plus 3.
- MEDIUM: "the station flyer is closer to the station after 1,200 ticks" is fragile: it spawns dead ahead of a just-launched player, pointing away from the station; the Shuttle has `max_flight_pitch` 0.9 and speed 80 (shipdata.plist:3501 block) and needs >= 3.5 s to turn while moving away, with fly-to cutting speed during the turn; the net gain in 10 s is a few hundred metres at best, possibly negative. Use a longer horizon or spawn it facing the station.
- LOW: Task 3's verify omits lint and typecheck (`:182-186`) though the verification section lists them (`:217`).
- Confirmed: `flightTableFrom` is the single table builder; inert ships are skipped by the step; the 5,400 m fleer bound is correct (Adder speed 240).

### 14-19 (decisions, FIDELITY rows, report, owner gate) — risk MEDIUM
- HIGH (inherited from 14-17): the acceptance rerun fails if the owner chose (a) (`:141-142`).
- MEDIUM: the FIDELITY row-count gate does not fit the contract: one Oolite path and range per row, one excerpt per row, at most 20 lines per excerpt (`tests/contract/fidelity.test.ts:45-47,220-253`). Task 1 lists 13 mechanics, several covering two code sites (applyRoll + applyAttitudeChanges, startTrackingCurve + updateTrackingCurve, performFlee + behaviour_flee_target, avoidCollision + setProximityAlert, escort refresh + form-up); split they are 15 to 18 rows, breaking "between 10 and 14" (`:121`). Ranges 5808-5854 and 7018-7065 exceed 20 lines. Name the exact excerpt ranges or relax the gate.
- LOW: Task 4's check `rg -c FIDELITY-REPORT PROJECT.md` (`:197`) passes as soon as any row mentions the report; tie it to the oracle-choice row text.
- LOW: the Vitest-share count includes oracle self-tests and detector tests, so it is met trivially; acceptable if the report says so.

### Whole-phase assessment (C)
- Coverage: criterion 1 by 14-01, 14-02, 14-06, 14-09..15; criterion 2 by 14-07 and 14-17 but outcome under (a) undefined and the run may pass without testing much; criterion 3 by 14-16, 14-18; criterion 4 by 14-04, 14-07, 14-19; criterion 5 by 14-18, 14-19. AI-01, WORLD-07, AI-11 each covered.
- Ordering: waves 1 and 2 share no files; 14-08..14-19 strictly sequential; 14-17 before 14-18 fixes the stale-evidence problem; the oracle plans all finish before 14-08 creates `src/sim/npc/state.ts`.
- Size: 19 plans, 51 tasks, about 1.555M estimated tokens (up from 1.43M); remote runs: 14-07 verify, 14-18 targeted e2e, 14-19 verify, plus two local acceptance runs. Possible small cuts: skip the 14-19 acceptance rerun when `git diff` shows no `src/sim` change since 14-17; fold the 35k-token 14-05 into 14-12.
- Owner gates: 14-08 and 14-19 correct; the 14-17 escalation is a hidden third gate.
- Overall risk MEDIUM; structure sound; blockers are the (a)/(b) encoding in 14-17/14-19 and the vacuity of the acceptance run.
- Round 1 confirmed fixed: marker defect, old 14-15/16 wave sharing, detector freeze (except under (b)), parking rule, runtime budget and separate `test:acceptance`, `STATION_RADIUS`, one table builder, two-replay spawn ranges, bounded ticks, partial-spawn taint, one flee metric, docs merged into 14-19, hash-policy row in 14-08, `/tmp` tree re-created, `expect(` count meaning, optional owner look, explicit requirement marking, single phase-end remote `verify`. Still open: zero hull crossings (outcome (a) has no encoding, HIGH); cadence test near-tautological (accepted deferral).
- Verdict: do not execute yet; fix how option (a)/(b) is encoded in `thresholds.ts` and the 14-17 freeze check, and add run-level minimums so the acceptance run cannot pass without testing anything.

## Consensus Summary

### Agreed Concerns (2+ reviewers, highest priority)
1. **HIGH — the parallel-offset avoid/proximity case cannot raise an alert in Oolite (A 14-06, B 14-15; verified by two reviewers against `ShipEntity.m:6119-6129` and `CollisionRegion.m:304-309`).** Offset 2(r1+r2) always exceeds the alert trigger 2*r_self + r_other, and the Viper pair trigger sits exactly on its strict `<`. 14-06's fixture and 14-15's test must use an offset below 2*min(r) + max(r) (e.g. 1.5*(r1+r2)), keep clearance as observed, or assert "no alert" at 2(r1+r2). The avoid destination after alert loss is the other ship's last known position, not the midpoint (B).
2. **HIGH — acceptance thresholds, hull-crossing resolution and script placement (A 14-07, C 14-17/14-19).** The frozen mapping puts intercept targets 290-550 km from the parked player (lost at 32 km, zero net progress, `MAX_STUCK_WINDOWS = 0` breached; flee detector vacuous when the flyer starts beyond 25.6 km). Option (a) of the hull-crossing resolution has no encoding that lets the run pass; option (b) contradicts the one-commit freeze check; `other` crossings can be faithful behaviour (flee ignores alerts at accuracy < 0). The run needs a start-placement rule and run-level minimums, and a detector-defect escalation, all committed before thresholds freeze; 14-17 needs an explicit checkpoint task or a recorded hidden gate.
3. **MEDIUM — float32 versus float64 accumulator divergence (A 14-01, 14-02, 14-06).** Event ticks for frustration/time thresholds (0.5 s, 7.5, 9.375, 10.0, 12.5) differ by one tick between GLfloat and double; the tracking-curve sample tick likewise depends on the `universal_time` base. The contract must decide once: `Math.fround` emulation or an event-tolerance rule.
4. **MEDIUM — property/record domain validity (B 14-08, 14-09).** Tracking-curve ticks must be strictly decreasing; sanitiser and parser must enforce it and the generators draw domain-valid records only.
5. **MEDIUM — player radius source (B 14-11, with 14-12/14-15/14-18 downstream).** Lazily loaded hull data makes radius, ranges and replay parity timing-dependent; use a compiled constant.

### Single-reviewer items worth acting on
- 14-04: the priority AI wakes through `ship.AIScriptWakeTime` + `aiAwoken`, not `Timer` (A).
- 14-02: intercept target loss posts `shipAchievedDesiredRange` and `shipTargetLost` (A).
- 14-12: self-target must be invalid; `noteLostTargetAndGoIdle` zeroes frustration; `trackPrimaryTarget` retreat calls `setEvasiveJink:400` and 14-13 must wire it (B).
- 14-14: unarmed bounce claim only with zero jink; `[target primaryTarget] == self` rule for NPC targets (B).
- 14-11: `massOf` is module-private and `ship-field.ts` is missing from `files_modified` (B).
- 14-16/14-18: station-flyer and scanner-contact assertions that can pass vacuously or fail on placement; `FLYER_SCRIPT_RANGES` lint ban; Task 3 verify omits lint/typecheck (C).
- 14-19: FIDELITY row-count gate versus the one-range-per-row contract and 20-line excerpt cap (C).
- 14-06: `crossDtTolerance` derivation assumes range >> desiredRange (A).

### Agreed Strengths
- Oracle independence by process and guard; thresholds committed alone before the port; Round 1 fixes confirmed in executable plan text (marker set, avoid/radius ordering, tracking-curve reset, Shuttle range 0, follower refresh in `stepWorld`, 14-15/14-16 reorder); all spot-checked Oolite citations accurate; no scope creep in the oracle/content plans; dependency graph, waves and shared-file ordering sound.

### Divergent Views
- Reviewer C suggests small cuts (skip the 14-19 acceptance rerun when `src/sim` is unchanged since 14-17; fold 14-05 into 14-12); A and B raise no size concern. Owner policy is "less but better", so cuts that do not weaken a check are favoured.
- Reviewer A rates the 14-07 `other`-class resolution MEDIUM (faithful crossings exist); Reviewer C rates the encoding of (a)/(b) HIGH. Both point at the same fix: decide the encoding before thresholds freeze.
