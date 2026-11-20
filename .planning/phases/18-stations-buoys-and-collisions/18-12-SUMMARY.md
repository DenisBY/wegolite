---
phase: 18-stations-buoys-and-collisions
plan: 12
subsystem: planning
tags: [phase-close, fidelity, todos, tripwires, verify-full, qual-11]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "plans 18-01 to 18-11 and 18-13 to 18-22: the static hull artifact, statics as laser and ident targets, buoy blockage, compass and lifecycle, collisions, drift, the blast, the PD-03 measurements and the proximity prefilter"
provides:
  - "The two folded todos closed, naming the plans that closed them; the planet-and-sun todo records its buoy half as delivered"
  - "FIDELITY.md complete for Phase 18: five missing rows added, with excerpts E-151 to E-153"
  - "The tripwire evaluation at the phase close: none triggered, and the Phase 20 collision-reversal guard still bites"
  - "The phase's one release gate (remote verify-full, PD-04) and the QUAL-11 acceptance, both green at the committed HEAD 5b3cc96"
affects: [phase-19, phase-20, fidelity, todos]

actuals:
  tokens: 16479
  tasks: 2
  commits: 1
plan_head_before: ee30d918cc67288c3316db03bec1d17c2b3994a9
plan_head_after: 5b3cc96f27f79a4fa1f099623f5db7843cbbcbdf

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/todos/completed/2026-11-15-lasers-and-ident-hit-stations-and-buoys.md
    - .planning/todos/completed/2026-11-14-make-buoys-block-hyperspace-like-oolite.md
    - .planning/todos/pending/2026-11-20-dock-straddle-double-contact-event.md
    - .planning/todos/pending/2026-11-20-dist-check-purity-probe-race.md
  modified:
    - FIDELITY.md
    - .planning/PROJECT.md
    - .planning/todos/pending/2026-11-10-add-planet-and-sun-collision.md
    - .planning/todos/pending/2026-11-18-mutual-kill-credit-symmetry.md
    - .planning/todos/pending/2026-11-20-ident-hud-raw-static-key-traffic-off.md

key-decisions:
  - "The FIDELITY walk found five Phase 18 rules with no row and added them: the static hull octrees (DATA-15, faithful, reuses E-29), the octree-against-octree composition (a divergence: float64 maths, the unreachable fourth stage not ported, and the totality bounds; E-153), the NPC and buoy drift pass after the steering loop (a divergence, E-151), the player drift's torus-disengage and float32 edges (a divergence, reuses E-138) and the negative scrape amount (a divergence no caller reaches, E-152)"
  - "PROJECT.md's collision row still described the superseded lower-ranked prime and a 631 m/s rebound that 18-20 refuted. Both now match the z-order prime row and the measurement. This is a documentation fix; no decision changed"
  - "The traffic-off raw ident key stays pending, with a reason (the default production build never shows it) and a proposed quick task for the owner to schedule"

patterns-established: []

requirements-completed: [DATA-15, CBT-17, CBT-18]

coverage:
  - id: D1
    description: "Folded todos closed (lasers-and-ident by 18-04, 18-05, 18-15, 18-06; buoy blocking by 18-07); planet-and-sun todo keeps its planet and sun half open"
    verification:
      - kind: other
        ref: "test -f .planning/todos/completed/2026-11-15-...md && test -f .planning/todos/completed/2026-11-14-...md; rg -c 'buoy half' planet-and-sun todo (1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "FIDELITY.md carries a row for every Phase 18 rule and divergence; the contract holds, every excerpt verbatim against the pin"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "OOLITE_SRC=<git archive 7437f22 src> vitest run tests/contract/fidelity.test.ts (9 of 9, none skipped)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tripwires evaluated; the collision-reversal guard fails its synthetic producers and passes the tree"
    verification:
      - kind: unit
        ref: "tests/guards/collision-player-death.test.ts (10), kill-credit-consumers (8), on-event-handlers (4), ship-hit-consumers (6), hud-message-length (4), collision-chain-scope (6)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Release gate: remote verify-full and QUAL-11 acceptance at the committed HEAD"
    requirement: CBT-18
    verification:
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm verify-full (exit=0 elapsed=869s snapshot=5b3cc96)"
        status: pass
      - kind: integration
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance (exit=0 elapsed=83s snapshot=5b3cc96, 21 of 21, 0 seeds differ from 18-21)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Owner reading of the recorded Phase 18 divergences and the open owner questions below"
    verification: []
    human_judgment: true
    rationale: "Whether each recorded divergence is acceptable, and the CONTEXT-text and collisions-on-seeds questions, are owner decisions, not test outcomes"

duration: 25min
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 12: Phase close Summary

**Phase 18 closes on a green release gate. The remote `verify-full` passed at 5b3cc96 (exit 0, 145 plus 2 Chromium specs, statics spec included). The QUAL-11 acceptance passed 21 of 21, and every seed matches 18-21's numbers. The two folded todos are closed, and FIDELITY gained the five rows the phase still lacked (E-151 to E-153). No tripwire is triggered.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-11-20T16:54:29Z
- **Completed:** 2026-11-20T17:20:00Z
- **Tasks:** 2
- **Files modified:** 10 (one commit) plus this SUMMARY

## Accomplishments

- **Todos.** `2026-11-15-lasers-and-ident-hit-stations-and-buoys` is closed by plans 18-04, 18-05, 18-15 and 18-06. Its closing note cites E-48: the subentity rule is ported, and its one divergence is the station's absorb. It also cites E-52 (ident, `faithful`). `2026-11-14-make-buoys-block-hyperspace-like-oolite` is closed by plan 18-07. Its "Check first" arrival question is answered by 18-07's measurement: the nearest arrival is 809.1 m from the beacon, so an immediate re-jump after arrival is never refused. `2026-11-10-add-planet-and-sun-collision` records that its buoy half was delivered by 18-07, 18-11 and 18-18; the planet and the sun stay unscheduled.
- **FIDELITY walk.** I checked the must_haves list and the round-1 and round-2 lists against the Mechanics table. Every item has a row except the five below, which are now added:
  1. Static hull octrees, DATA-15 (`ship-static-hull.ts:103`, `OOMesh.m:609-619`, faithful, E-29).
  2. Octree-against-octree composition, `doOctreesCollide` (`collide.ts:160`, `ShipEntity.m:1902-1921`, new E-153). A divergence: the maths run in float64, the C's fourth stage (`:1924-1938`) is not ported because it is unreachable, and the totality bounds (18-02, 18-09) apply.
  3. NPC and buoy drift (`world/drift.ts:111`, `ShipEntity.m:5817-5824`, new E-151). A divergence: the drift runs as one pass after the whole steering loop (18-17).
  4. The player drift's edges (`flight/drift.ts:57`, E-138 reused). A divergence: the torus factor resets to 1 on disengage while the speed still ramps down, and a drift whose float32 magnitude is 0 becomes the zero vector (18-10, review L428/L174).
  5. The negative scrape amount (`shields.ts:205`, `PlayerEntity.m:5710-5713`, new E-152). A divergence that no caller reaches (18-16).
- **Orchestrator's list, already covered:**
  - 1 m/s push after a separating early return: E-131 row "Each body runs its own collision list".
  - Scrape negative amount: new row 5 above.
  - Station not pushed by a blast: E-133.
  - Launching player not pushed by a blast: E-147.
  - Burnt-out wreck with no blast: E-150.
  - Subentity contact resolved once, and the station not a collider: E-135.
  - D-08, pods and plates never block: the D-08 row, E-22.
  - Compass cycle: E-126.
  - Round-2 rows: sticky routing E-121 (same-tick and reticle notes), tumble E-119, prime E-135, station offender consequence in E-48, launching-player blast E-147, buoy blast mass and subentity source E-148/E-149, 10 x DT nudge E-134, buoys as proximity candidates E-142, prefilter E-143, amended Phase 14 no-prefilter row E-69, drift bounce E-133, stale destroyed-flag energy E-132, layout-buoy torus surface E-32, station blast reason E-133.
  - The PD-03 measurements sit in their subsection. The walk did not call for a gate line there: the gates measure Wegolite, not Oolite.
- **CHANGELOG `[Unreleased]`.** Every user-visible plan has its line, each in its own commit: 18-04 `e08c4c7`, 18-05 `68bfb7f`, 18-15 `f51b4f7`, 18-06 `c87825e`, 18-07 `8a68443`, 18-08 `13c873b`, 18-11 `8674c1c`, 18-18 `721eec6`, 18-19 `129cd6a` and 18-21 `24f7cda`. Follow-ups: `9bd9f6a` (the HUD budget raised to 60) and `eb97849` (the z-order prime). None is missing, and none was added here.
- **Owner decisions of 2026-11-20 checked for consistency** across PROJECT.md, FIDELITY and STATE:
  - The twin re-pins and the standing approval.
  - The traffic-off key deferral.
  - The beacon copy and the 55 then 60 character budget.
  - PD-08 for buoy pairs only, with all pairs as a todo.
  - The z-order prime.
  
  One inconsistency was found and fixed (deviation 2).

## Task Commits

1. **Task 1: todos, FIDELITY walk, tripwire evaluation (tracer)**: `5b3cc96` (docs). Tracer gate (auto mode): `lint` and `assets:check` passed on the same content before the commit, so Task 2 went ahead.
2. **Task 2: release gate and acceptance**: no file change. The walk did not call for a FIDELITY gate line, so the results live in this SUMMARY and its commit.

## Release gate (remote, committed HEAD)

| Run | snapshot | Result | exit | elapsed |
|-----|----------|--------|------|---------|
| `run --rm test npm run test:acceptance` (QUAL-11) | 5b3cc96 | 21 passed of 21 | exit=0 | elapsed=83s |
| `run --rm verify-full` (PD-04, the phase's only one) | 5b3cc96 | lint clean, typecheck clean, `assets:check` no differences; unit 268 files, 7,091 passed, 10 skipped; Chromium 145 passed (12.1 min) plus 2 passed; no failure, no flake, no rerun | exit=0 | elapsed=869s |

- **QUAL-11 numbers.** I compared all 20 seeds against 18-21's table, and through it against 18-19's run. Arrivals, AVOID_COLLISION, attack ticks, stuck and frozen windows, both clearances and the failure counters all match: 0 seeds differ. Totals: arrivals 40/40/40, AVOID_COLLISION 23, attack ticks 61,662, stuck windows 175, frozen windows 293. Every failure counter is 0. This is a frozen-worlds check only: the harness enables no collisions and loads no statics or buoy mass. The phase's collision evidence comes from the unit, cadence and property suites and from 18-22's traffic-on `statics.spec.ts`. `verify-full` ran that spec here, and it passed.
- **Local (Docker).** `lint` exit 0. `assets:check` reported no differences. `typecheck` exit 0. `test` exit 0: 268 files, 7,091 passed, 10 skipped, coverage thresholds held (all files 96.66 / 94.02 / 99.07 / 97.51). The FIDELITY contract ran verbatim (`OOLITE_SRC` set to a `git archive 7437f22 src` extract) and passed 9 of 9, none skipped.
- `git diff --quiet 76229f5 -- tests/acceptance` exits 0. No test, threshold or detector was edited.

## Tripwire evaluation (none triggered)

| Todo | Guard / check | Result | Reason not triggered |
|------|---------------|--------|----------------------|
| `2026-11-18-mutual-kill-credit-symmetry` | `tests/guards/kill-credit-consumers.test.ts` 8/8 | pass | Nothing outside the kill path reads `killer`, `shipTargetDestroyed` or `shipKilledOther`. Rams (18-11) now make same-tick mutual kills routine. The todo now records this, together with the outcome that 18-11's both-lethal case pins ("two Kraits that kill each other in one ram", `collision-stage.test.ts`: the lower id is credited to the other ship, the higher id carries `NO_ENTITY`). |
| `2026-11-18-narrow-kill-time-ship-target-lost` | `tests/guards/on-event-handlers.test.ts` 4/4 | pass | `flight-script` is still the only `AI_REGISTRY` module with `onEvent`. |
| `2026-11-17-skip-shiphit-for-a-doomed-target` | `tests/guards/ship-hit-consumers.test.ts` 6/6 | pass | Nothing subscribes to `shipHit`. |
| `2026-11-19-player-ident-lock-in-target-targets-self` | `git diff 76229f5 -- src/sim/npc/behaviours/attack.ts src/sim/npc/target.ts src/sim/ai` is empty | pass | 18-06 widened what ident can lock to statics and debris, but the player's lock still does not reach the NPC view, and populated ships keep `ai: null`. |
| `2026-11-19-collision-reversal-on-player-death` (for Phase 20) | `tests/guards/collision-player-death.test.ts` 10/10 | pass | `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20` is still at `collide.ts:240`. The synthetic producer cases still fail the rule: an object-literal push, a factory beside the declaration lines, a constant, `FlightMode` gaining a member or losing its literal union, the ledger losing its floor marker, and a second declaration copy. The tree passes. The guard is unchanged since `42ed567` (18-18), so it has not been weakened. |

Phase-18 guards also hold: `hud-message-length.test.ts` 4/4 (word-wrap todo) and `collision-chain-scope.test.ts` 6/6 (all-pairs prefilter todo).

## Owner questions (open)

1. **18-CONTEXT PD-02 figures.** 18-20 measured three CONTEXT figures as wrong: the buoy carried "about 10 m" (really 8.333 m nudge plus 9.583 m braking, about 17.9 m), "about 122 m after 350 m/s" (a 350 m/s ram destroys the buoy, so there is no carry), and the "631 m/s rebound" (`otherDestroyed` reverses it, so there is no net rebound). Should the 18-CONTEXT.md text be corrected? **Recommendation:** leave CONTEXT as the historical record and point readers to the 18-20 SUMMARY and the FIDELITY PD-03 subsection. The PD-02 decision itself stands.
2. **18-20 INCONCLUSIVE verdicts: none.** 18-20 returned no INCONCLUSIVE quantity and no MISMATCH, so no mismatch todo was created and no gated plan was stopped. For completeness:
   - two early slot sessions were discarded as INCONCLUSIVE set-ups (the dock took in the barrel) and were replaced by clean sessions;
   - the `tris` winner (`dock-tris-corner-oblique`) was never measured, because it was not in 18-20's list of parts;
   - in the 350 m/s, energy 5,000 session the player's speed after contact differs by 0.026 m/s (0.008 %), probably because that frame also carries the buoy's explosion.
   
   No owner action is needed unless the owner wants the tris beam measured.
3. **No gate runs the 20 frozen seeds with collisions on (review L189@b45e113).** The crossing detector measures a ship's centre entering a hull, not hull contact, and a collisions-on run would need a harness option that the frozen-harness rule forbids. Today the evidence for collisions in traffic is 18-21's populated scenario (`collision-traffic.scenario.test.ts`, 2 seeds) and the traffic-on browser specs. Should a collisions-on world measurement be added, with owner approval for the harness change?
4. **Traffic-off raw ident key** (`2026-11-20-ident-hud-raw-static-key-traffic-off`). I triaged it as keep pending. The proposed fix is a quick task that installs the five static names whatever the traffic flag, then re-pins the traffic-off ident test and the Node twin's "buoy" message, and needs the remote `verify`. Schedule it, or accept the raw key as a test-bundle-only divergence?
5. **Owner reading of the recorded divergences** (18-19 asked for this at the close):
   - station not pushed by a blast (E-133);
   - launching player not pushed (E-147);
   - burnt-out wreck with no blast (E-150);
   - 1 m/s push not reproduced (E-131 row);
   - drift as one pass after steering (E-151);
   - torus factor reset and float32 drift to zero (E-138 edges row);
   - scrape negative amount (E-152);
   - subentity contact resolved once and the station not a collider (E-135);
   - D-08 (pods and plates never block);
   - compass cycle (E-126);
   - octree composition (E-153).
   
   Each is recorded with its PROJECT.md row; none is a known bug.
6. **Beacon refusal visual check** (18-07). No automated check looks at the drawn width of "Witchspace jump aborted: too close to Witchpoint Beacon". Look at it once on screen by completing a jump within about 264 m of the beacon.
7. **Dock straddle double event** (18-10, new todo `2026-11-20-dock-straddle-double-contact-event`). Settle it in a dock-feel review: should the straddle push clear the proxy face, or should the second `bounce` be suppressed?

## Carried forward

- **Pending todos with guards:**
  - `2026-11-20-hud-message-word-wrap-like-oolite` (guard `hud-message-length.test.ts`)
  - `2026-11-20-collision-chain-prefilter-all-pairs` (guard `collision-chain-scope.test.ts`; owner chose to keep it a todo)
  - `2026-11-19-collision-reversal-on-player-death` (Phase 20)
  - `2026-11-18-mutual-kill-credit-symmetry`
  - `2026-11-18-narrow-kill-time-ship-target-lost`
  - `2026-11-17-skip-shiphit-for-a-doomed-target`
- **Pending todos without a guard:**
  - `2026-11-19-player-ident-lock-in-target-targets-self`
  - `2026-11-20-torus-nearest-surface-live-buoys`
  - `2026-11-20-ident-hud-raw-static-key-traffic-off`
  - `2026-11-10-add-planet-and-sun-collision` (planet and sun half)
- **Deferred items** (`deferred-items.md`), now with todos:
  - the dock straddle double event (18-10): `2026-11-20-dock-straddle-double-contact-event`;
  - the dist-check ENOENT race (18-22): `2026-11-20-dist-check-purity-probe-race`. It is a tooling quick task: skip `__purity_*` files, as the content scanners already do. It did not recur in this `verify-full`.
- **Commits without the Co-Authored-By trailer** (made by the GSD commit tool, history not rewritten): `0f0bb42` (docs(18-03)) and `6043d87` (docs(18-21)).
- **Comment nits left in `src`** (this plan touches no source):
  - `src/sim/world/drift.ts:11` and `:104` cite `ShipEntity.m:5808-5823` and `5816-5823` for the NPC brake. At the pin, `if (thrust)` through its closing brace is 5817-5824. FIDELITY E-151 and PROJECT.md now cite 5817-5824.
  - The `OctreeNode` doc comment in `src/sim/combat/octree.ts` still cites `Octree.m:640-645` for the node layout. Those lines are `volumeOfOctree` (18-09 issue).
- **The 20-seed acceptance run** stays outside every gate (Phase 14 IN-04). Rerun it by hand after any later `src/sim/npc/**` or `src/sim/world/**` change.

## Decisions Made

See `key-decisions`. No owner decision was made or re-made: the 2026-11-20 decisions were checked, not revisited.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Docs completeness] Five Phase 18 rules had no FIDELITY row**
- **Found during:** Task 1 (the walk)
- **Issue:** The static hull octrees, the octree-against-octree composition, the NPC and buoy drift pass, the player drift's edges (18-10's "For 18-12's FIDELITY walk") and the negative scrape amount (18-16's Next Phase Readiness) were recorded only in SUMMARYs or code comments.
- **Fix:** Five rows and excerpts E-151 to E-153, each copied from `git show 7437f22`. The contract passes in verbatim mode.
- **Files modified:** FIDELITY.md
- **Committed in:** 5b3cc96

**2. [Rule 2 - Docs honesty] Stale statements in PROJECT.md's collision row**
- **Found during:** Task 1 (consistency check of the owner decisions)
- **Issue:** The row "Collisions follow Oolite's collideWithShip, octree against octree" still said the stage made the lower-ranked body the prime, which the owner decision of 2026-11-20 superseded (`eb97849`). It also said a full-speed buoy ram gives "up to 631 m/s rebound ... as in Oolite", which 18-20 refuted. The drift row cited `ShipEntity.m:5816-5823`.
- **Fix:** The prime clause now points to the z-order row. The 350 m/s sentence now states the measured outcome: the buoy is destroyed and `otherDestroyed` leaves no net rebound. The citation now reads 5817-5824. No decision changed.
- **Files modified:** .planning/PROJECT.md (outside the plan's file list)
- **Committed in:** 5b3cc96

**3. [Plan criterion wording] The e2e acceptance criterion lists one modified spec; the tree has two**
- **Found during:** Task 1 acceptance check
- **Issue:** `git diff --name-only --diff-filter=M 76229f5 -- tests/e2e` prints `tests/e2e/combat.spec.ts` as well as `tests/e2e/hyperspace-failure.spec.ts`.
- **Resolution:** The `combat.spec.ts` change is only the `TWIN_HASH_60_AFTER_KILL` constant. It was re-pinned by the owner-approved option-A decisions in 18-05 (`8b7f54b`) and 18-06 (`f3d04bc`), which came after the plan was written. No other spec changed, the added spec is exactly `statics.spec.ts`, and nothing was edited here.

**Total deviations:** 2 auto-fixed (both Rule 2, documentation) and 1 criterion explained. **Impact:** documentation only. No code, test, threshold or detector changed.

## Issues Encountered

None. The release gate passed on its first run, with no flake and no rerun.

## User Setup Required

None.

## Next Phase Readiness

Phase 18 is complete: 22 of 22 plans, with DATA-15, CBT-17 and CBT-18 evidenced.
- **DATA-15:** 18-01 artifact and measurement, 18-13 load path, 18-20 dock-mouth SAME, 18-22 chunk spec.
- **CBT-17:** 18-04, 18-05, 18-15, 18-06, and the 18-22 spec.
- **CBT-18:** 18-10, 18-11, 18-16, 18-17, 18-18, 18-19 and 18-21, the station still damage-free, and the gate above.

Ready for the phase verification and the next phase. Phase 20 inherits the collision-reversal tripwire.

## Self-Check: PASSED

- Files exist: both completed todos, both new todos, FIDELITY.md (E-151, E-152, E-153 present).
- Commit `5b3cc96` is an ancestor of HEAD.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-20*
