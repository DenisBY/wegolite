---
phase: 14
reviewers: [claude-opus-A, claude-opus-B, claude-opus-C]
reviewed_at: 2026-11-15
plans_reviewed: [14-01-PLAN.md, 14-02-PLAN.md, 14-03-PLAN.md, 14-04-PLAN.md, 14-05-PLAN.md, 14-06-PLAN.md, 14-07-PLAN.md, 14-08-PLAN.md, 14-09-PLAN.md, 14-10-PLAN.md, 14-11-PLAN.md, 14-12-PLAN.md, 14-13-PLAN.md, 14-14-PLAN.md, 14-15-PLAN.md, 14-16-PLAN.md, 14-17-PLAN.md, 14-18-PLAN.md]
models:
  claude-opus-A: "claude-opus (subagent, read-only)"
  claude-opus-B: "claude-opus (subagent, read-only)"
  claude-opus-C: "claude-opus (subagent, read-only)"
model_sources:
  claude-opus-A: "agent model override"
  claude-opus-B: "agent model override"
  claude-opus-C: "agent model override"
---

# Cross-AI Plan Review — Phase 14

Three independent Claude (opus) reviewers, each read-only, split by plan group: A = 14-01..06, B = 14-07..14, C = 14-15..18 plus a whole-phase assessment. No external CLI was used (owner request: use Claude models). Reviewers verified plan claims against the repo at HEAD `62d7419` and the Oolite checkout (pinned `7437f22`). All cited Oolite line ranges that were spot-checked (about 45 by A, more by B and C) were accurate; the findings concern plan design, ordering and a few departures from Oolite. The reviewer reports were condensed into this file; only findings are kept.

## Reviewer A — plans 14-01 to 14-06

### 14-01 (oracle I) — risk MEDIUM
- MEDIUM: the oracle import guard only checks import specifiers that resolve into `src/`. It misses indirect imports through `tests/helpers/*` (which import `src/`, e.g. `traffic-fixture.ts:2`), imports into `tools/`, and `readFileSync(new URL("../../../src/..."))`. Fix: allow only bare package names (zod, vitest, `node:`) and relative specifiers that stay inside `tests/oracles`; refuse `src/` path literals in file reads.
- MEDIUM: no fixture covers the `applySticks` accuracy branch at ShipEntity.m:7034-7041 (rate doubles when the stick is 0 and accuracy >= 7.5). Add a flight-model row at accuracy 8 or 9, stick 0.
- MEDIUM: the frame-rate rule claim (1/60 and 1/120 settle to the same heading at 2 s) has no tolerance stated before measurement; state the cross-dt tolerance in `frame-rate-rule.json` first.
- LOW: repeated events (intercept 3824, fly-to 5057, fly-range 5142 post `shipAchievedDesiredRange` every tick inside range) must be listed or the horizon kept short; the face "0.5 x old_pitch" branch (4958-4959) is sign-flip damping, not a frame-rate hack; "nine families that do not need a primary target" is misleading (escort and avoid involve other bodies).
- Note: oracle and port both read the same source, so a shared misreading is not caught; independence is of code, not interpretation.

### 14-02 (oracle II) — risk MEDIUM
- MEDIUM: reachability claim is wrong. `performFlee` (ShipEntityAI.m:383-389) picks EVASIVE_ACTION (15 %) or FLEE_EVASIVE_ACTION whenever `accuracy > 0` and aspect > 0.9995. Stock accuracy is drawn in [-5, 5) (ShipEntity.m:665-669), so about half of stock ships qualify. RESEARCH.md:315 and the plan's IN/OUT rationale must be corrected; add a flee row at accuracy 2 with aspect > 0.9995. Under the temperature-0 cut the dispatcher's own EVASIVE branch (4103) is unreachable; EVASIVE comes from 4727/4796 or `performFlee`.
- MEDIUM: the "nearby" dispatcher row (4144-4150) consumes two `ranrot_rand()` draws in `setEvasiveJink` (8982-8986); the plan does not script them and the contract fails on a draw-count mismatch.
- MEDIUM: simulated trajectory checks (intercept, flee, attack) have no executable reference; hand-computed values are checked only when the port fails in 14-10..12. Limit to closed forms / one-tick / axis-aligned values, or replay through an extended reference.
- LOW: SIX also requires aspect < 0 (4158); row poses must set target forward accordingly.

### 14-03 (content flight fields) — risk LOW
- Values for all nine ships match the templates; defaults 160/2.0/1.0/15.0 match ShipEntity.m:263-270.
- MEDIUM: "update the content golden through its existing writer path" — there is no writer; `tools/oolite-ingest/convert/npc-ships.test.ts:7-8` says the golden is hand-written. Say "hand-edit from the plist values" so independence is kept.
- LOW: NpcShip literals elsewhere (`tests/helpers/inert-world.ts`, `tests/app/session/*.test.ts`) may need the new fields and are not in `files_modified`.

### 14-04 (AI-11 spike) — risk MEDIUM (acceptable for a spike)
- MEDIUM: one shared vm context lets the scripts clobber each other (`this.name`, `this.aiStarted`, bare global `PriorityAIController`, `worldScripts["oolite-libPriorityAI"]`). Use one context per script with the library registered as `worldScripts["oolite-libPriorityAI"]`; a role AI is a ship script (`ship.AIScript`), not a world script.
- LOW: the vm `timeout` covers only `runInContext`, not later AI calls; invoke through `runInContext` or record the gap. LOW: library `startUp` (6675) likely needs descriptions/plist data; expect the stub inventory to grow.

### 14-05 (dist check + thresholds) — risk HIGH until marker set fixed
- HIGH: see Agreed Concerns #1 (marker set fails on a clean tree).
- MEDIUM: thresholds are committed before the 14-14 scripts they measure; definitions (fixed vs sliding windows, net vs path displacement, "window-start value" when the goal is met mid-window) are ambiguous and cannot be edited afterwards. Intercept/attack use `hasProximityAlertIgnoringTarget:YES` (3878, 4787), so `MAX_HULL_CROSSINGS = 0` against a parked player over 20 seeds x 2 attackers x 150 s may fail for a faithful port.
- LOW: `STATION_RADIUS` is not exported (`src/sim/world/layout.ts:71`); use `layout.station.radius`. LOW: the single-commit `git log` assertion breaks on any later prettier touch and on shallow clones; keep it as a summary check, not a CI test. LOW: `pages.yml:37` production build is not checked; adding `check:dist` there is cheap.

### 14-06 (steering record, snapshot v3, owner checkpoint) — risk MEDIUM
- MEDIUM: Task 1 leaves a broken commit: `steer` is added to `Entity` and the hash, but `restoreWorld` learns about it only in Task 2; snapshot tests and the `Record<keyof Entity>` table fail. Give restored entities a default `steer` in Task 1, or commit 1+2 together.
- LOW: the sanitiser cannot know which ids are dead (`sanitizeEntity(entity)` has no store, sanitize.ts:328); match `nav.targetId` (uint32 check only) and move liveness to steering. LOW: lazily drawn accuracy changes draw order versus Oolite (setup draw at 665-669); record as a divergence.

### Cross-plan (A)
- 14-07 depends on 14-06, 14-01, 14-02 but not 14-05; add 14-05 to 14-07 `depends_on` so "thresholds before the port" does not hold only by wave numbering.
- Correct the `performFlee` EVASIVE reachability in RESEARCH so 14-11 and 14-16 do not inherit it. No scope creep found.

## Reviewer B — plans 14-07 to 14-14

### 14-07 (flight model tracer) — risk MEDIUM
- MEDIUM: the property "speed stays in [0, maxFlightSpeed]" is false for starting speed above max: `decrease_flight_speed` (ShipEntity.m:7418-7429, `MIN_HYPERSPEED_FACTOR`) steps down over several ticks; TUMBLE returns at 5826 before the ramp. Generate start speed in [0, max]; port `decrease_flight_speed` literally.
- MEDIUM: state `applyThrust` order exactly (TUMBLE return, clamp written back to `nav.desiredSpeed` at 5830-5831, ramp, move). A tumbling ship does not move at all.
- MEDIUM: `entryPending` edge cases: two performs in one think; an AI `setDesiredRange` after `performAttack()` is overwritten by the deferred draw (record as divergence). Say `completeEntry` switches on current `nav.behaviour` and every entry without a deferred part clears the flag.
- LOW: STATION_KEEPING should run stop-still (2494-2496); attitude sign "resolved by test" needs one physical turn-direction test; Vitest file isolation means a module-level "fixtures that ran" record does not cross test files.

### 14-08 (trackDestination, fly-to, face, avoid entry/exit) — risk MEDIUM-HIGH
- HIGH: `avoidCollision` cannot be ported faithfully here: Oolite sets `desired_range = prox_ship->collision_radius * PROXIMITY_AVOID_DISTANCE_FACTOR` (5931) but `BodyView.radius` arrives only in 14-10, and no later plan revisits `avoid.ts`. Move avoid to 14-10/14-13 or add explicit tasks there (radius-based range, `startTrackingCurve` call, frustration 0).
- MEDIUM: `resumePostProximityAlert` also calls `startTrackingCurve` (5946) and zeroes frustration (5953). MEDIUM: the rate-rule test needs "a fixture the runner ran in this test run" — impossible across Vitest files; have it run its `confirmedBy` fixtures itself or export static group lists.
- LOW: the zero-vector guard `relPos.z = 1.0` (9496) must be z = -1 in Wegolite's frame; `int factor = sqrt(...)` truncates (9520); the `d_forward` clamp (T-14-16) is not in Oolite — label it an addition.

### 14-09 (world step uses steerShip) — risk MEDIUM
- MEDIUM: the step-integration spec is wrong for default stats: default `maxFlightSpeed` 160 clamps and writes back desired speed 200; the re-pin formula omits `maxFlightSpeed`; fly-to's 50 % cuts (5085-5087) pollute the ramp. Use IDLE with an explicit desired speed and expect `min(desiredSpeed, maxFlightSpeed, n*5*thrust*dt)`.
- MEDIUM: first coverage run is in this plan's Task 3; floors are tight (97 % functions, 86 % branches, vitest.config.ts:39-45) and literally ported dead branches can drag them down. Measure coverage at the end of 14-07/14-08.
- LOW: omit `a: undefined` keys (`exactOptionalPropertyTypes`); every `stepWorld` caller must pass `AI_REGISTRY`; with `npcFlight` absent, mass defaults to 0 and silently disables proximity alerts — fall back to `hyperspace.shipMasses` or record it.

### 14-10 (view radius, sensing, tracking curve, intercept) — risk HIGH
- HIGH: the steering record (14-06) has no sampled-target id, but the plan resets the curve when the target differs; adding a field later breaks the "snapshot v3, regenerate golden once" rule. Oolite resets in `addTarget` (8662-8665). Reset in `control-impl.ts` `setTarget` (e.g. `trackingCount = 0` = start pending) and run a literal `startTrackingCurve` when the count is 0, or add `trackingTargetId` in 14-06 now.
- HIGH: NaN risk: `calculateTrackingCurve` divides by `t1*t2*(t1-t2)` (5468-5483); zero-initialised ticks give NaN/Infinity. Port `startTrackingCurve` (5425-5442; samples at now, now-20, -40, -60), give ticks a signed domain (or store relative to now) so the sanitiser does not count repairs.
- MEDIUM: `trackPrimaryTarget` and `evasiveAction` need `emit` and `draw` (they call `noteLostTargetAndGoIdle`, `setEvasiveJink:400`); `missedShots` fixed at 0; `shipTargetLost` carries the target only while valid (8785) — Task 3 says "carries the lost id"; adding required `radius` breaks the `bodyView()` helper in `tests/sim/ai/test-pilot.test.ts:148-155` (not in `files_modified`).
- LOW: `isValidTarget` treats only ships/stations/buoys/player/wormholes as valid — map `BodyView.kind`; z-mapping of 9081/9112 guards; intercept posts `shipAchievedDesiredRange` every tick in range (T-14-17 "only on transitions" is wrong).

### 14-11 (flee, jink, evasive) — risk LOW-MEDIUM
- MEDIUM: `evasiveAction` needs `emit`; the deferred `performFlee` aspect check reads poses one tick later and can flip near 0.9995 — record as a divergence. LOW: `range == 0` counts as safety (4855) but ranges subtract radii and can be negative; add one property case.

### 14-12 (attack dispatcher + sub-behaviours) — risk MEDIUM
- HIGH: the Shuttle's weapon range is not fixed: with no forward weapon `getWeaponRangeFromType(nil)` is 0 (ShipEntity.m:443-466, 13041-13044), not 32000 from `equipment.plist`. The value decides fly-from's exit test (4775): 0 bounces ATTACK_TARGET/FLY_FROM every tick; 32000 flees 16 km. Add a constants-ledger row (range 0 for EQ_WEAPON_NONE) and make the 14-02 decision table agree.
- MEDIUM: `setEvasiveJink(range + COMBAT_JINK_OFFSET - relativeSpeed / max_flight_pitch)` needs `|self.velocity - target.velocity|`; in Oolite velocity includes forward x flightSpeed (11163-11166); specify it from `BodyView` including the player. LOW: `COMBAT_AI_*` constants added by both 14-07 and 14-12.

### 14-13 (proximity, avoid collision, escort) — risk HIGH
- HIGH: the follower refresh cannot live in `steerShip` (read-only `WorldView`, `ownerId` not on `ShipView`); do it in `stepWorld` right after each leader's `steerShip`, after its `applyThrust`.
- HIGH: the oracle runner is not in `files_modified`; `avoid-collision.json` and `escort.json` need proximity and leader-refresh hooks in the runner.
- HIGH: the 14-01 escort fixture lists two followers but the contract allows exactly one steered `self`; settle with the oracle author how a second follower is represented.
- HIGH: the `proximity.test.ts` head-on scenario ("never within the sum of radii") contradicts Oolite: alert fires below 4*max(r) (~140 m for two Vipers), at 320 m/s that is ~26 ticks, pitch reaches only ~0.1 rad; a faithful port collides and pushes the executor toward forbidden tuning (Pitfall 6). Replace with alert -> avoid -> resume plus a closed-form clearance geometry.
- MEDIUM: who takes part in the proximity pass is unclear (must_haves "steered ships and the player" vs "live ships"); alerts on inert ships change their hashes; the station raises alerts in Oolite (6097-6110). Suggested: every live ship, station and player as candidates, alerts written only on steered ships; record the inert choice. Escort divergences: Oolite writes every escort's destination regardless of behaviour (2431-2436); slots shift when an escort dies. `oracle-coverage.test.ts` has the same cross-file isolation problem as 14-08. LOW: when the other ship is gone, avoid keeps flying to the old midpoint until `distance > desired_range` (5159-5168).

### 14-14 (flight-script pilot, flyers scenario, cadence) — risk LOW-MEDIUM
- MEDIUM: the flee goal check should use one definition (centre distance vs `rangeToPrimaryTarget` radii). LOW: assert which branch the fleer enters; cadence test is near-tautological but keeps value in the accumulator and spawn tick; inert-ship steering records may change under the 14-13 pass.

### Cross-plan (B)
1. Dependency gaps: `avoid.ts` (14-08) needs radius and tracking curve from 14-10; steering record lacks a target id; runner lacks proximity/leader hooks for 14-13.
2. Helper signatures incomplete: anything reaching `noteLostTargetAndGoIdle`/`setEvasiveJink` needs `draw` and `emit`; the escort refresh needs world access. Fix the 14-07 contract text once.
3. Frame mapping must negate z for every literal `kBasisZVector`/`relPos.z = 1.0` fallback (9081, 9112, 9496) and the escort pattern vectors.
4. Record divergences in 14-17: deferred perform entries, `shipTargetLost` argument, weapon range 0, fixed escort slot, inert ships/station in proximity, intercept per-tick event.
5. Coverage is first measured in 14-09; measure earlier. Cost (O(n^2) proximity, ~32k pairs/tick) acceptable.
6. Phase goal reachable once the HIGH items in 14-08, 14-10, 14-12, 14-13 are fixed.

## Reviewer C — plans 14-15 to 14-18 and whole phase

### 14-15 (session/replay wiring, spawnTestFlyers, opt-in e2e) — risk MEDIUM (HIGH until 14-05 fixed)
- HIGH (inherited): remote `verify` fails from the 14-05 marker defect.
- MEDIUM: 14-15 and 14-16 share wave 11, but 14-16 may fix port defects in `src/sim/npc/**` (not in its `files_modified`); that makes 14-15's remote evidence stale and both plans commit in the same tree the wrapper syncs. Run 14-16 before 14-15 or add the path to 14-16.
- LOW: `TrafficContent.flight` and `realNpcFlightTable()` are two builders of the same table — share one; the spawn range the Node replay compares against is undefined (`runTickScript` returns only the final world, tick-script.ts:250-257); "populated count plus 3" breaks if the fleer reaches 25,600 m (bound the tick count); draw-call check is weak evidence (loaded scene 17 calls); `spawnTestFlyers` can spawn some ships then return false (document taint).

### 14-16 (20-seed acceptance) — risk MEDIUM-HIGH
- MEDIUM: detector meaning can drift after thresholds are frozen (window alignment, "goal unmet", coverage, which pose of the other ship). Commit `detectors.ts` and `detectors.test.ts` before any epoch is enabled and check with git in Task 2 that they are unchanged.
- MEDIUM: the player pose is chosen during the run and only recorded in the summary; fix a deterministic pose rule in `thresholds.ts` or the detectors commit.
- MEDIUM: 360,000 world steps plus `hashWorld` and hull checks per tick run in every `test` and remote `verify` (`vitest.config.ts:82-86`, `compose.yaml:113-117`) on a slow machine; set a time budget and decide between default suite and an explicit `test:acceptance` script.
- MEDIUM: zero hull crossings against a parked player may force a mid-phase owner escalation; not budgeted.
- LOW: `STATION_RADIUS` not exported (use `layout.station.radius`); state that the runner writes `ownerId`/escort slot directly for converted escorts.

### 14-17 (Key Decisions, FIDELITY rows) — risk LOW technically, high cost
- MEDIUM: ~22 Key Decisions rows plus ~35 mechanics rows with excerpts is the largest docs plan (95k tokens) for little checked value (`fidelity.test.ts:203-219` checks string presence and line <= file length). Group scope cuts into a few rows and limit FIDELITY to ~12 rows.
- MEDIUM: the owner's 14-06 hash-policy / snapshot-v3 decision is not recorded in `PROJECT.md` for ~10 waves (AGENTS.md: record when made); write it in 14-06.
- LOW: Wegolite `file:line` cells rot; `/tmp/oolite-7437f22` reused across tasks without re-creation.

### 14-18 (report, Vitest share, sign-off, owner gate) — risk LOW once 14-05 fixed
- HIGH (inherited): remote `verify` fails until 14-05 is fixed.
- LOW: the 90 % measurement counts diff lines with `expect(`, not assertions run; say so in the report. LOW: add an optional owner look at flying ships (`?test=1&traffic=1`, `spawnTestFlyers`). LOW: marking AI-01/WORLD-07/AI-11 complete is implicit.
- Suggestion: make this the phase's single remote `verify`, merge the slimmed 14-17 into it.

### Whole-phase assessment (C)
- Success criteria 1-5 are all covered (criterion 2: freeze detectors and pose too; criterion 4: marker defect). No requirement gaps.
- Ordering: 14-15 beside 14-16 (above); 14-07..14-13 are serialised by shared files (correct); the 14-06 owner checkpoint blocks all porting.
- Size: 18 plans, 51 tasks, ~1.43M estimated tokens, three remote `verify` runs. Suggested cuts in order: slim and merge 14-17 into 14-18; one remote `verify` at phase end (plus 14-05's own); settle where the acceptance run lives; optionally move attack sub-behaviours (sniper, six/twelve, slow dogfight) to the AI port phase (nothing selects them without NPC fire).
- Overall risk MEDIUM-HIGH: sound structure; concrete blocker is the `check:dist` marker list; residual risks are 14-16 zero-tolerance hull threshold and acceptance runtime.

## Consensus Summary

### Agreed Concerns (2+ reviewers, highest priority)
1. **HIGH — 14-05 `DIST_MARKERS` fails on a clean build (A, C; verified by the orchestrator).** `oolite-shuttleAI.js` is shipped content (`src/content/generated/ships-npc.json:166`, bundled via `import.meta.glob`, `src/content/ships-npc.ts:32`); `oolite-priorityai.js` appears in a comment (`src/sim/ai/pilots/test-pilot.ts:128`) and `vite.config.ts:66` sets `sourcemap: true`, so it lands in `dist/**/*.map`. The first remote `verify` and every later `verify`/`verify-full` (including CI) would exit 1; 14-15 Task 3 and 14-18 Task 1 are blocked. Fix: use only markers that harness/AILib code itself contains (`AI_HARNESS_SENTINEL`, `PriorityAIController`, `oolite-libPriorityAI`, or a code fragment), drop the bare file names, skip `*.map` or strip `sourcesContent`, add a test over the real `ships-npc.json` text and a real `build:e2e` output.
2. **Oracle cross-file isolation / runner scope (A import guard; B 14-08, 14-13).** The import guard misses indirect imports; the "fixtures that ran" record cannot cross Vitest test files (14-07, 14-08, 14-13); the 14-07 runner lacks proximity and leader-refresh hooks needed by 14-13, and the escort fixture needs a second follower the contract cannot express.
3. **Acceptance thresholds and detector definitions are underspecified or can drift (A 14-05, C 14-16).** Windows, displacement, window-start value, player pose and `MAX_HULL_CROSSINGS = 0` against a parked player; detectors and pose must be frozen before epoch 1; runtime/placement of the 20-seed run needs a budget.
4. **Reachability error about EVASIVE/FLEE_EVASIVE (A 14-02; affects B 14-11/12 and C acceptance).** `performFlee` reaches them for `accuracy > 0` (about half of stock ships); correct RESEARCH.md:315 and 14-02 rationale.
5. **Plan/wave ordering defects (B, C, A).** `avoid.ts` before radius/tracking-curve exist; 14-15 beside 14-16 while 14-16 may edit `src/sim/npc`; 14-07 lacks `depends_on` 14-05; steering record lacks tracked-target id (14-06 vs 14-10).
6. **Scope/cost (C; A and B no creep).** 18 plans is heavy for "less but better"; slim 14-17 and merge into 14-18; one phase-end remote `verify`.

### Single-reviewer HIGH items worth acting on
- 14-10: tracking-curve NaN with zero-initialised ticks; port `startTrackingCurve`; signed tick domain (B).
- 14-12: Shuttle weapon range is 0 for EQ_WEAPON_NONE (B).
- 14-13: follower refresh must run in `stepWorld`; head-on "never within radii" assertion contradicts Oolite (B).

### Agreed Strengths
- Oracle independence by process (wave 1, separate agents, `src/sim/npc` absent) and guard; thresholds committed alone before the port; owner checkpoints at 14-06 and 14-18 are blocking with no auto-select; remote-run rule respected everywhere; all spot-checked Oolite line citations accurate; no scope creep in the oracle/content plans.

### Divergent Views
- Whether to keep 14-17 as a full plan (A and B treat the decisions/FIDELITY rows as required; C recommends slimming and merging into 14-18).
- Whether the attack sub-behaviours (sniper, six/twelve, slow dogfight) should stay (research/ROADMAP require a stated in-scope list) or move to the AI port phase (C, optional).
- 14-06 Task 1/2 split: A wants one commit or a default `steer`; B and C do not raise it.
