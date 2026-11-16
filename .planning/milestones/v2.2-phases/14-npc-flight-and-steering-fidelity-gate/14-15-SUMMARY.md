---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 15
subsystem: sim
tags: [npc-flight, steering, proximity, avoid-collision, escort, formation, oracle-coverage, world-step]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-09's steering contract and runner hook slots, 14-11's world-step steering and massFor, 14-12's pending tracking starts, 14-13's avoidCollision and resumePostProximityAlert, 14-06's avoid-collision and escort fixtures
provides:
  - runProximityPass, proximityAlertFor and pairTriggers (proximity.ts), the one pair trigger and setProximityAlert shared by the world pass and the oracle runner
  - behaviour_avoid_collision (behaviours/avoid-collision.ts)
  - escortCoordinates, refreshEscorts (escort.ts) and behaviour_formation_form_up (behaviours/formation.ts), with the FORMATION_FORM_UP entry row
  - the proximity pass and the escort refresh in stepWorld
  - the runner's default beforeUpdate (leader refresh) and afterUpdate (proximity) hooks
  - BEHAVIOUR_ROUTES, the read-only routing table steerShip now dispatches through
  - oracle-coverage.test.ts, and avoid-escort.oracle.test.ts running avoid-collision.json and escort.json; the pending-fixture mechanism of rate-rule.oracle.test.ts is gone
affects: [14-16, 14-17, 14-18, 14-19]

requirements-completed: []
requirements-advanced: [AI-01]

plan_head_before: f65296a6f3fb6d70293c3f6d504dd6145b7c5006
plan_head_after: 00a04dd7c1b742995aa4aea588a60407e4dc37b4

actuals:
  tokens: 22830
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Step-level modules (proximity.ts, escort.ts, and plan 14-12's tracking-curve.ts) are the only ones that walk the world's live list; steerShip and every behaviour read other bodies through the view and write only the steered entity"
    - "One pair rule for the world and the runner: proximityAlertFor takes the body, its mass and a lookup of the held alert, so the runner's synthetic bodies and the world's entities go through the same code"
    - "A live-world scenario derives its alert tick, entry midpoints and destinations from the closed form of a straight-line approach, never from running the port"

key-files:
  created:
    - src/sim/npc/proximity.ts
    - src/sim/npc/escort.ts
    - src/sim/npc/behaviours/avoid-collision.ts
    - src/sim/npc/behaviours/formation.ts
    - tests/sim/npc/avoid-escort.oracle.test.ts
    - tests/sim/npc/proximity.test.ts
    - tests/sim/npc/escort-refresh.test.ts
    - tests/sim/npc/oracle-coverage.test.ts
    - tests/sim/npc/world-support.ts
  modified:
    - src/sim/npc/constants.ts
    - src/sim/npc/dispatch.ts
    - src/sim/npc/enter.ts
    - src/sim/world/step.ts
    - tests/sim/npc/constants.test.ts
    - tests/sim/npc/oracle-groups.ts
    - tests/sim/npc/oracle-runner.ts
    - tests/sim/npc/rate-rule.oracle.test.ts
    - tests/sim/npc/steering.property.test.ts

key-decisions:
  - "runProximityPass takes the step's lazy view builder (getView), not a view: a world with no steered ship builds no view and allocates nothing in the pass"
  - "steerShip dispatches through BEHAVIOUR_ROUTES (a Map of the old switch's rows) instead of exposing a second table beside the switch, so the table a test reads is the dispatch itself and cannot drift from it"
  - "The formation behaviour reuses the FLY_TO_* ledger numbers that Oolite shares (0.51 eta margin, 4 s no-thrust slowdown, 0.05 turn coefficient, 0.5 cut) and adds FORMATION_* names only for the five numbers of its own"
  - "An owner equal to the ship's own id counts as no leader (Oolite's default owner is the ship itself, which would read its own speed); a recorded divergence for an unreachable state"
  - "The already-avoiding rule of setProximityAlert: is ported as written (6139-6141): the body that subtends the SMALLER angle keeps the slot; the comment above it says the opposite"

patterns-established:
  - "A non-vacuity mutation per task: PROXIMITY_WARN_DISTANCE2 16 to 9 failed 3 oracle and 5 world tests; ESCORT_SPACING_FACTOR 3 to 2 failed 13; removing the refreshEscorts call failed 3; deleting a routing row and a manifest row failed oracle-coverage; all reverted"

coverage:
  - id: D1
    description: "pairTriggers and proximityAlertFor match the cited lines on hand-derived cases: the 4 r pair trigger (strict, either radius), the zone 2 r + r_other in the ship's own frame, the forward stretch 0.25 x max / speed for a body ahead only, the 2,000 kg mass rule, a station as self, and the already-avoiding comparison as written"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/proximity.test.ts#the pair trigger; #setProximityAlert: the zone; #setProximityAlert: who alerts; #setProximityAlert: already avoiding"
        status: pass
    human_judgment: false
  - id: D2
    description: "AVOID_COLLISION matches the avoid-collision oracle (head-on alert and exit, parallel-offset pass, the negative pass, the station body, the light ship) through avoidCollision and resumePostProximityAlert, and the hand-derived cases: ten of the other's radii and its position while the alert holds, retreat, speed between half and full, resume past the desired range, a vanished alert body"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/avoid-escort.oracle.test.ts#tests/oracles/npc/fixtures/avoid-collision.json"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/proximity.test.ts#behaviour_avoid_collision"
        status: pass
    human_judgment: false
  - id: D3
    description: "In a live world two steered Vipers on antiparallel tracks at 1.25 x (r1 + r2) alert at the closed-form tick 355, enter AVOID_COLLISION the next tick with the midpoint and 10 x 35.06 m, steer for the other ship's position each tick while the alert holds, and restore FLY_TO_DESTINATION 151 and 152 ticks after the alert (bound 360); at 2 x (r1 + r2) no alert ever; a head-on pair alerts, avoids and resumes in that order; the station dead ahead alerts at the first tick below 2,000 m; a 1,000 kg body never alerts and a 5,000 kg one does; an inert ship keeps a default record and an unchanged entity; the player's radius is the compiled constant (equal hashes with and without the hull table)"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/proximity.test.ts#case (a); #case (f); #case (b); #case (c); #case (d); #case (e); #case (g)"
        status: pass
    human_judgment: false
  - id: D4
    description: "FORMATION_FORM_UP matches the three escort fixtures (slot 0, slot 1, no leader) through the runner's leader-refresh hook, and the hand-derived cases: the eta speed rule, the 50 % slowdown, frustration with and without a leader, pitching over when far, the proximity call site, performEscort's guard"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/avoid-escort.oracle.test.ts#tests/oracles/npc/fixtures/escort.json"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/escort-refresh.test.ts#behaviour_formation_form_up; #performEscort; #escortCoordinates"
        status: pass
    human_judgment: false
  - id: D5
    description: "The world step refreshes each steered leader's followers right after the leader's move, regardless of follower behaviour, in a same-tick read for a higher-id follower and a previous-tick read for a lower-id one; a removed leader leaves the no-leader path; an inert leader, inert followers and strangers are never written"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/escort-refresh.test.ts#the leader refresh in the world step"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every fixture of both oracle trees is assigned to exactly one oracle test file, every test file is in the manifest, every in-scope id routes to its own behaviour and only the out-of-scope ids take the idle fallback"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/oracle-coverage.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "FORMATION_FORM_UP and AVOID_COLLISION stay total under the fast-check property, with a leader that dies mid-run, a leader of any kind, none, itself and an unknown id, and an alert naming a removed ship with a saved condition to resume"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/steering.property.test.ts#formation and avoid collision are total (plan 14-15)"
        status: pass
    human_judgment: false
  - id: D8
    description: "The full local suite with the src/sim coverage floors, lint and both typecheck projects pass; the remote verify gate passes on the committed HEAD; tests/oracles and tests/acceptance are untouched"
    verification:
      - kind: command
        ref: "docker compose run --rm test (198 files, 4891 passed, 10 skipped, exit 0)"
        status: pass
      - kind: command
        ref: "docker compose run --rm lint; docker compose run --rm typecheck"
        status: pass
      - kind: command
        ref: "remote verify at 00a04dd (27 e2e passed, exit 0)"
        status: pass
    human_judgment: false

duration: 100min
completed: 2026-11-15
---

# Phase 14 Plan 15: Proximity pass, avoid collision, escort formation and oracle coverage Summary

**Steered NPC ships now warn each other, the station and the player through a once-per-tick proximity pass using Oolite's pair trigger and `setProximityAlert:`, avoid and resume as Oolite's `behaviour_avoid_collision:` does, and fly in the default V formation behind a leader whose world-step update refreshes its followers; all eight avoid and escort fixtures pass the first time they were run, and a static coverage test now proves that every fixture of both oracle trees is assigned to exactly one oracle test file and that only the out-of-scope ids take the idle fallback.**

## Performance

- **Duration:** about 100 minutes
- **Tasks:** 3 of 3 (Task 1 was the `tracer`; auto mode is on, so its `<verify>` was re-run before expanding and passed)
- **Files:** 9 created, 9 modified (about 22,830 tokens by chars/4 over the added lines of `src` and `tests`; the self-check base is the measured `plan_head_before`)

## Accomplishments

- **Proximity pass** (`proximity.ts`): `pairTriggers` (`dist2 < 16 r^2` for either radius, strict, `CollisionRegion.m:304-312`), `proximityAlertFor` (`setProximityAlert:` 6098-6146: the 2,000 kg rule, a station as self, the zone `2 r_self + r_other` in the ship's own frame with the forward stretch for a body ahead, the already-avoiding comparison) and `runProximityPass`: clear every steered ship's alert, then test each pair once in ascending id (main station, player, then the live ships). Called from `stepWorld` after the pending tracking starts and before the sanitize loop, so an alert set at the end of tick N is read at tick N+1. Candidates and masses are as the plan decided; alerts are written only on steered ships.
- **Avoid collision** (`behaviours/avoid-collision.ts`): ported from 5155-5171. While the alert names a body the view returns, desired range is 10 x its radius and the destination its position every update; the ship retreats (`trackDestination` with retreat) at `maxFlightSpeed x (0.5 dq + 0.5)`; with the alert gone the last destination stays until the range exceeds the desired range, then `resumePostProximityAlert`.
- **Escort** (`escort.ts`, `behaviours/formation.ts`): `escortCoordinates` (the V pattern, `highPart`/`lowPart`, spacing `radius x 3 x highPart`, rotated into the leader's frame, z negated), `refreshEscorts` (every live steered ship whose `ownerId` is the leader, ascending id, regardless of behaviour, only `nav.destination`), called from the update loop right after each steered entity's `steerShip`. `behaviour_formation_form_up` reads the leader through its own `ownerId` and `ctx.view`. `performEscort` is a new entry row.
- **Runner hooks:** `emptyHooks()` now carries `escortRefreshHook` (beforeUpdate, through `escortCoordinates`) and `proximityHook` (afterUpdate, clears self's alert then applies `pairTriggers` and `proximityAlertFor` to every body that is not a planet or a sun). They apply to every fixture, so all earlier fixtures also ran with them and did not move.
- **Coverage and routing:** `steerShip` dispatches through `BEHAVIOUR_ROUTES`; `oracle-coverage.test.ts` compares the manifest with the loaded fixtures, the test files on disk and the routing table. `avoid-collision.json` and `escort.json` joined `ORACLE_GROUPS` under `avoid-escort.oracle.test.ts` and left the pending mechanism, which was removed from `rate-rule.oracle.test.ts`; the PORTED list gained 5155-5171, 6098-6146, `CollisionRegion.m` 262-312, 5002-5047, 2427-2436, 11900-11903, 11996-12044, `ShipEntityAI.m` 365-371 and `oolite-global-prefix.js` 165-193.

## Task Commits

1. **Task 1 (tracer): the proximity pass in the world step and the avoid-collision behaviour** - `9907577` (feat)
2. **Task 2: escort formation with the leader refresh in the world step** - `f076b6c` (feat)
3. **Task 3: every oracle fixture assigned and run, every in-scope id routed, formation and avoid total** - `00a04dd` (test)

Tracer feedback gate: auto mode is on (`workflow.auto_advance`), so after Task 1 the tracer's `<verify>` (`avoid-escort.oracle.test.ts`, `proximity.test.ts`, `avoid.test.ts`, the whole of `tests/sim/world`, prettier) was re-run and passed; `⚡ Tracer verified end-to-end — expanding`.

## Verification

- **Porter rule:** every port was written from the cited Oolite lines and its hand-derived unit and world tests (`proximity.test.ts` 40 cases, `escort-refresh.test.ts` 27) passed before `avoid-collision.json` and `escort.json` were first read or run. At the first oracle run **all eight fixtures passed**; there was no oracle dispute and no tolerance or fixture was touched (`git diff f65296a..HEAD -- tests/oracles tests/acceptance` is empty).
- **Non-vacuity (each mutation reverted, tree clean):** `PROXIMITY_WARN_DISTANCE2` 16 to 9 failed 3 oracle and 5 world tests; `ESCORT_SPACING_FACTOR` 3 to 2 failed 13; commenting out `refreshEscorts` in the step failed 3; deleting the AVOID_COLLISION routing row and the `escort.json` manifest row failed `oracle-coverage.test.ts`.
- `docker compose run --rm test npx vitest run tests/sim tests/app`: **110 files, 2935 passed, 1 skipped**, run after Task 3 and before any re-pin (none was needed: no existing test moved).
- Full `docker compose run --rm test` with the coverage floors: **198 files, 4891 passed, 10 skipped, exit 0**. `docker compose run --rm lint` and `docker compose run --rm typecheck` (both projects): clean after each task.
- **Remote `verify`: run, passed** (`/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify`, snapshot `00a04dd`, 27 Chromium e2e passed, exit 0, 142 s). Run because the plan adds a per-tick pass over all ships; nothing browser-facing changed, and no ship in normal play is steered natively yet (only the test pilot performs a behaviour), so the pass returns at its first loop in a normal game.
- Acceptance greps: `proximity.ts`, `escort.ts`, `formation.ts` exist; `rg -c runProximityPass src/sim/world/step.ts` = 2, `rg -c refreshEscorts src/sim/world/step.ts` = 2, `rg -c afterUpdate tests/sim/npc/oracle-runner.ts` = 6, `rg -n crewed src/sim/npc/proximity.ts` finds the assumption (and `SHIPS_ARE_CREWED`), `rg -c 'refreshEscorts|runProximityPass' src/sim/npc/dispatch.ts src/sim/npc/behaviours` prints nothing. The `world.store` gate has one pre-existing exception, see Deviations.

### Coverage of `src/sim/**` (from `test-results/coverage/coverage-summary.json`, aggregated over files under `src/sim/`)

| Measure | After 14-15 | After 14-14 | Floor |
|---------|-------------|-------------|-------|
| lines | 97.72 | 97.75 | 93 |
| statements | 96.81 | 96.88 | 91 |
| functions | 99.45 | 99.62 | 97 |
| branches | 94.36 | 94.66 | 86 |

`proximity.ts` is 94.4 % of lines and 82.7 % of branches (what is uncovered is defensive: the `SHIPS_ARE_CREWED` false return and the dead-entity and missing-station skips of the pair loops); `escort.ts` is 100 % of lines; `formation.ts`, `avoid-collision.ts` and `dispatch.ts` are 100 % of lines and branches.

## Observed values (recorded, not promised)

- Case (a), two Vipers at a lateral offset of 87.64 m (1.25 x (r1 + r2), r = 35.0577 m): alert at tick 355 on both ships (closed form 355, pair trigger at an along-track separation of 109.5 m); **minimum centre distance 87.65 m** (the ships pass abeam and the lateral offset is the minimum); FLY_TO_DESTINATION restored at tick 507 (A) and 506 (B), 152 and 151 ticks after the alert against the bound of 360.
- Case (c): the station alert at tick 338, centre distance 1,998.7 m.

## Decisions Made

See key-decisions. Further choices:

- **Test layout:** the world scenarios (a) to (g) live in `proximity.test.ts` beside the unit cases, as the plan states; `world-support.ts` holds the shared scaffolding (player parked far away, a never-thinking AI, spawn and step helpers) that `escort-refresh.test.ts` also uses.
- **No CHANGELOG entry:** no ship in normal play is steered natively yet, so nothing user-visible changes (the same decision as plans 14-11 to 14-14).
- **`SHIPS_ARE_CREWED`** is an exported constant in `proximity.ts` so the crew gate (`ShipEntity.m:6116`) is a visible decision; a unit case pins it.

## Wegolite additions and divergences (for plan 14-19's list)

1. **Inert ships hold no alert.** Alerts are written only on steered ships (`ai` not null), so an inert ship keeps a default record and an unchanged hash. In Oolite every ship holds an alert.
2. **Station and player count as at or above 2,000 kg.** Both are far above it; the player is a candidate with the compiled radius `PLAYER_COLLISION_RADIUS_M`, never the lazily loaded hull.
3. **Buoys, planet and sun are not candidates** (the buoys' mass is not compiled). Planet and sun are not ships in Oolite either (`CollisionRegion.m:308`).
4. **Ascending-id pair order** (station, player, then ships) instead of Oolite's collision-chain order, `CollisionRegion.m:286-312`. It matters only for the already-avoiding comparison.
5. **No collision-chain prefilter** (`Universe.m:6713-6760`, 7045-7073): a pair of unequal radii far from the planet can alert where Oolite's +-2r interval filter would skip it. It never affects a pair of equal radii and is a no-op near the station, where the planet chains every entity (case (c)'s comment gives the Lave margins: the station lies about (-49.5, 60.8, 25.1) km from the planet centre inside its +-82.3 km interval).
6. **Crew gate treated as always crewed** (`ShipEntity.m:6116`): Oolite does not alarm ships without a pilot (cargo, rocks, missiles, buoys); Wegolite has no crew concept, so every listed ship is crewed (`SHIPS_ARE_CREWED`).
7. **Escort slots are fixed per follower** (`escortSlot`, set at spawn); Oolite's index shifts when an escort dies.
8. **An inert leader refreshes nobody**, and an inert follower is never refreshed.
9. **A follower with a lower id than its leader** steers before the leader moves and refreshes it, so it reads the previous tick's destination (pinned by a test); the acceptance mapping of plan 14-07 gives every escort a higher id than its leader.
10. **An owner equal to the ship's own id counts as no leader** (Oolite's default owner is the ship itself).
11. **The already-avoiding comparison is ported as written** (6139-6141): the body with the smaller subtended angle keeps the slot, which reads inverted against the comment above it.
12. **The station-launching and docking exemption (6112)** never applies; no NPC docks or launches in v2.2.
13. **The escort limit cycle** at the slowdown boundary (plan 14-06) is Oolite's own behaviour and the oracle checks only decision-stable ticks; `formation.ts` reproduces it.
14. **`frustration` after the formation relief** is floored at 0 as Oolite does (5031-5032); the formation report path `noteFrustration` posts `shipAIFrustrated` without the behaviour name, as in plans 14-10 and 14-13.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `runProximityPass` takes the step's lazy view builder**
- **Found during:** Task 1
- **Issue:** the plan's signature `runProximityPass(world, player, view, facts)` would force `stepWorld` to build a `WorldView` on every tick, including worlds with no steered ship, which the step's header comment promises not to allocate.
- **Fix:** the third parameter is `getView: () => WorldView`, called only when at least one steered ship exists.
- **Files modified:** `src/sim/npc/proximity.ts`, `src/sim/world/step.ts`
- **Commit:** `9907577`

**2. [Rule 3 - Blocking] The routing table replaces the switch**
- **Found during:** Task 3
- **Issue:** the plan asks to "expose the switch's routing as a read-only table from `dispatch.ts` if needed, without changing behaviour"; a second table beside the switch could drift from it.
- **Fix:** the switch became `BEHAVIOUR_ROUTES` (a `ReadonlyMap`) and `steerShip` looks its step up there, falling back to `behaviourIdle`. Every existing suite and fixture passes unchanged.
- **Files modified:** `src/sim/npc/dispatch.ts`
- **Commit:** `00a04dd`

**3. [Rule 2 - Missing critical functionality] Hand-derived unit tests before the oracle**
- **Found during:** Tasks 1 and 2
- **Issue:** the porter rule needs the ports covered by their own tests before the fixtures are read; the plan lists only the world scenarios.
- **Fix:** the pair trigger, `setProximityAlert:`, `behaviour_avoid_collision:`, `escortCoordinates`, `performEscort` and `behaviour_formation_form_up` have unit cases in `proximity.test.ts` and `escort-refresh.test.ts`, all derived by hand and all passing before `avoid-collision.json` and `escort.json` were run.
- **Commits:** `9907577`, `f076b6c`

### Plan wording

- **Acceptance of Task 2 (`world.store` gate):** `rg -l '^(?!\s*(//|\*|/\*)).*\bworld\.store\b' src/sim/npc | rg -v '^src/sim/npc/(escort|proximity)\.ts$'` prints `src/sim/npc/tracking-curve.ts`, not nothing. That file is plan 14-12's `startPendingTrackingCurves`, the third step-level walker of the live list, written before this plan and called from `stepWorld`. No steering module (`dispatch.ts`, `behaviours/`, `avoid.ts`, `track.ts`, `target.ts`) touches the store, which is the gate's purpose; `tracking-curve.ts` was not changed.
- **Files beyond the plan's list:** `constants.ts`, `constants.test.ts`, `rate-rule.oracle.test.ts` (the PORTED rows and the removal of the pending mechanism, which the project rules require), `steering.property.test.ts` and the new `world-support.ts`.
- **Task commits:** the plan's Task 1 and Task 2 share `step.ts`, `dispatch.ts`, the runner, the manifest and the constants; the two commits were split by editing those files to the Task 1 state, committing, and restoring the final state, so each commit passes lint and its own tests.

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing-critical). **Impact:** none on scope; the plan's behaviour, files and gates stand.

## Authentication Gates

None.

## Issues Encountered

- None blocking. The first run of cases (d) and (e) put the inert body at the far end of the approaching ship's track, where a ship flying alone reaches it after 750 ticks, not 375; it was a scenario placement error in the test (the inert body moved half way along the track), not a port defect.

## Known Stubs

None. Seven attack ids remain on the recorded idle fallback by design (RUNNING_DEFENSE, ATTACK_BROADSIDE and its two sides, CLOSE_TO_BROADSIDE_RANGE, CLOSE_WITH_TARGET, ATTACK_MINING_TARGET), as are the other out-of-scope ids; `oracle-coverage.test.ts` now pins that.

## Threat Flags

None. T-14-25 (pass cost) is mitigated: one pass per tick over at most `MAX_ENTITIES` live entities plus the station and the player, inline squared distances, and an early return when no ship is steered. T-14-26 (a stale leader or alert id) is mitigated: every lookup goes through the world store or the view, a missing leader takes the no-leader path, and an alert naming a gone body counts as none (tested at unit, world and property level). T-14-39 (the refresh writing a non-follower) is mitigated and tested: `refreshEscorts` writes only live steered ships whose `ownerId` is the leader, and only `nav.destination`. T-14-SC: no package installed.

## Facts for later plans

- **Step order now:** update (each steered ship's `steerShip`, then `refreshEscorts` for that ship as leader), think and drain, `startPendingTrackingCurves`, `runProximityPass`, sanitize, commit. Any ship with an `ai` is steered, so every ship a pilot module (plans 14-16 and 14-17) commands will be both avoided and avoiding.
- **Alerts reach every in-scope behaviour that calls `hasProximityAlertIgnoringTarget(entity, ctx, true)`**: fly-to, fly-from, fly-range, intercept, flee, evasive, the attack sub-behaviours and formation. An alert on the primary target is ignored (`ignoreTarget` true), so a ship that intercepts or attacks the player does not avoid the player; a ship flying to a destination near the player (radius 72.7 m, zone `2 r + 72.7`) does.
- **Escort setup for a pilot:** spawn the follower with `ownerId` the leader's id and `escortSlot` 0 to 15, with a HIGHER id than the leader, and `perform("FORMATION_FORM_UP")`; the leader must be steered (an `ai`) for the refresh to run. The leader's radius is its entity radius.
- **`BEHAVIOUR_ROUTES`** (`dispatch.ts`) is the dispatch itself; a plan that ports another id adds one row there and one to `EXPECTED` and `IN_SCOPE` in `oracle-coverage.test.ts`.
- **`emptyHooks()`** in the runner now includes the leader refresh and the proximity rule for every fixture. A later fixture whose body sits inside 4 radii of the steered ship, or whose `ownerId` names a body, is affected; every fixture of the earlier plans was run with the hooks and none moved.
- **`tests/sim/npc/world-support.ts`** (`playerAt`, `aiNever`, `spawnShip`, `stepOnce`, `flyTo`, `hullRadius`, `FACING_PLUS_Z`) is reusable for live-world tests of plans 14-16 to 14-18.
- **Plan 14-18 (acceptance):** the proximity pass is the only writer of `steer.proximityAlert`; a mapping with more than a few ships should measure ticks, not time, as T-14-25 states.
- **Plan 14-19:** the divergence list above; the PORTED list in `rate-rule.oracle.test.ts` is current to this plan.

## Self-Check: PASSED

- Created files exist: all 9 in key-files.created, plus `14-15-SUMMARY.md`.
- Commits `9907577`, `f076b6c` and `00a04dd` are ancestors of HEAD; `git show --first-parent --diff-filter=D --name-only` on each prints no deleted file.
- `commits: 3` is measured with `git rev-list --count f65296a..HEAD` before this SUMMARY commit (`plan_head_after` is the Task 3 commit); `git diff f65296a..HEAD -- tests/oracles tests/acceptance` is empty.
