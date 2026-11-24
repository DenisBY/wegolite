---
phase: 18-stations-buoys-and-collisions
plan: 11
subsystem: combat
tags: [collisions, collideWithShip, octree, update-order, ledger, scrape, drift, debris]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "18-09 doOctreesCollide; 18-16 collideWithShip and routeScrapeDamage; 18-10 FlightState.drift and the station contact; 18-17 the ship drift pass; 18-20 the real-Oolite anti-conjoin finding"
provides:
  - "src/sim/combat/collide.ts: resolveCollisions (the stage), colliderRank, runContactCalls, PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20, RankedBody, RankedContact"
  - "src/sim/combat/ledger.ts: HitRecord.kind (\"laser\" | \"scrape\"); a scrape on the player goes through routeScrapeDamage (no cabin heat)"
  - "src/sim/combat/step.ts: CombatOptions.collisions (opt-in); resolveShots appends the stage's records after the laser records, before applyLedger"
  - "src/sim/combat/constants.ts: PLAYER_MASS_KG = 214_737.6875 (pinned to the compiled Cobra)"
  - "src/app/session/step-options.ts: buildStepOptions sets combat.collisions: true"
affects: [18-18, 18-19, 18-21, 18-22, 18-12]

actuals:
  tokens: 118675
  tasks: 3
  commits: 5
plan_head_before: b0d6e6969e5f8ad360fe04747511557fb5523d85
plan_head_after: 4ad34457cf5e6bc343a53d076f9a7b764b8977d9

tech-stack:
  added: []
  patterns:
    - "Each body runs its own collision list in rank order (Oolite's manageCollisions): a collided call removes self from the other's list, a separating call leaves it"
    - "Motion applied at once in call order, damage queued as scrape records into the one ledger (A5)"
    - "An opt-in stage flag the frozen harness never sets keeps the acceptance worlds byte-identical"

key-files:
  created:
    - tests/sim/combat/collision-stage.test.ts
  modified:
    - src/sim/combat/collide.ts
    - src/sim/combat/step.ts
    - src/sim/combat/ledger.ts
    - src/sim/combat/constants.ts
    - src/sim/sim.ts
    - src/app/session/step-options.ts
    - tests/sim/combat/ledger.test.ts
    - tests/sim/combat/constants.test.ts
    - tests/sim/combat/kill.property.test.ts
    - tests/sim/combat/step.test.ts
    - tests/app/session/sim-driver.test.ts
    - .planning/PROJECT.md
    - FIDELITY.md
    - CHANGELOG.md

key-decisions:
  - "Per-body collision lists (orchestrator note from 18-20): the stage runs each body's own list in rank order, as manageCollisions does; a call that collides removes self from the other's list (ShipEntity.m:11149-11150), a separating call leaves it and the other calls in its own turn (runContactCalls). Because the stage runs once after every body has moved, the reverse call sees the same relative velocity and also separates, so the 1 m/s push 18-20 measured in Oolite does not occur in Wegolite; recorded as a FIDELITY divergence"
  - "resolveCollisions takes (world, player, combat, options), without the plan's layout argument: nothing in this plan reads the layout (18-18 adds it with the buoys if it needs it)"
  - "A subentity contact is ported in the stage (the subentity's absolute position and mass, the parent's velocity and frangibility) but its damage goes to the parent's id: no collider of this plan has a subentity, and 18-18 gives the buoy subentity its own target"
  - "The update-order rank is a FIDELITY divergence row, not 'ported': the contract test accepts only the exact word faithful or a divergence, and an exact sort differs from Oolite's incrementally sorted list"

patterns-established:
  - "Collision records copy the source's position at queue time, before the response moves either body"

requirements-completed: [CBT-18]

coverage:
  - id: D1
    description: "The player rams a Krait: collideWithShip's response applied at once with the player as self, two scrape records after the laser records, the Krait's energy lowered by dam2 and the player's forward shield by dam1 with no cabin heat, and no further hit over 600 idle ticks"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#applies collideWithShip's response at once, the player as self, and queues two scrape records"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#through stepSim: damages each side once, drains the forward shield without heat, and never again over 600 idle ticks"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/ledger.test.ts#routes a scrape on the player through the shield on the source's side, with no cabin heat, never lethal (CBT-18)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Oolite's update order: colliderRank (player first, nearest first, ties by id, non-finite last) and the per-body call order of runContactCalls"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#colliderRank (Oolite's update order, Universe.m:6439, 6534)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#runContactCalls (each body's own list, ShipEntity.m:10991-11017, 11149-11150)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#two NPCs collide with the one nearer the player as self"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pods and plates collide (debrisMassOf masses), a pod rammed above 15.3 m/s is removed (PD-05), a Krait rammed to zero dies through killShip with debris credited to the player, a mutual ram kill keeps the D-10 credit asymmetry"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#ships, pods and plates (D-01, D-07, PD-05)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Exclusions: the launching player, the station, wreckage, a pod without debris content, a massless ship and contact at exactly the radius sum make no pair; a manual dock is byte-identical with collisions on and off at zero drift and after a 68 m/s drift into the hull"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#the exclusions"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#docking is unchanged with collisions on (DOCK-09)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The opt-in: without collisions nothing happens and a tick that never collides changes no hashed state; the app sets collisions: true; the frozen acceptance worlds are unchanged (21 of 21, same numbers)"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#without the opt-in nothing happens: the player passes through, and the hashes equal collisions: false"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/collision-stage.test.ts#a tick that never collides changes no hashed state (criterion 5)"
        status: pass
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#buildStepOptions"
        status: pass
      - kind: other
        ref: "remote: wegolite-remote-run.sh run --rm test npm run test:acceptance (21/21, snapshot=4ad3445)"
        status: pass
      - kind: e2e
        ref: "remote: combat, traffic, tick-hook and npc-flight specs (10 passed, snapshot=4ad3445)"
        status: pass
    human_judgment: false
  - id: D6
    description: "How rams feel in play (rebound size, damage, pod removal) in a real browser session"
    verification: []
    human_judgment: true
    rationale: "No browser spec drives a ram; the feel of a collision in play is for the owner's UAT"

duration: 35min
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 11: The Collision Stage for Ships and Debris Summary

**Ships, cargo pods, alloy plates and the player now collide: an opt-in stage inside `resolveShots` finds every octree contact, runs Oolite's `collideWithShip` in Oolite's update order with each body working its own collision list, applies the rebound at once and queues the damage as `"scrape"` records into the one ledger, so kills, debris and the player's heat-free shield drain follow the existing paths.**

## Performance

- **Duration:** about 35 min
- **Started:** 2026-11-20T11:55:19Z
- **Completed:** 2026-11-20T12:30:01Z
- **Tasks:** 3 (Tasks 1 and 2 TDD, Task 1 a tracer)
- **Files:** 15 (1 created, 14 modified)

## Accomplishments

- `resolveCollisions(world, player, combat, options)`:
  - Colliders are the in-flight player (combat state and hull; never while launching), live ships with a hull and a `massFor` mass above 0, and live pods and plates with their `debrisMassOf` mass (none without the debris content). The station and wrecks are never colliders.
  - Broad phase: a sweep sorted on `x - radius` (ties by id, non-finite last), then Oolite's strict sphere test `d^2 < (r1 + r2)^2`.
  - Narrow phase: `doOctreesCollide` with the lower rank as prime.
  - Response: `runContactCalls` runs every body's list in rank order. Each call reads the live positions and total velocities (drift plus forward x speed, plus the player's dock `impulse`), applies `dv1`/`dp1` and `dvOtherBody`/`dpOther` at once, clamped at the write, and queues one scrape record per applied side, self's first, each with a copy of the source's position.
- `colliderRank`: the player first, then ascending squared distance from the player, ties by id, a non-finite key last (a total order).
- `HitRecord.kind`: a scrape on the player goes through `routeScrapeDamage` (no cabin heat); every other target keeps its branch.
- `CombatOptions.collisions`: the stage runs only with it, a stepped world and a hull table. `buildStepOptions` sets it; the acceptance harness does not.
- `sim.ts`: the stage is now documented as the one world-side write to the player's `FlightState` (its drift and position).
- Docs: two Key Decisions rows, "Debris is not a target in Phase 16" fully superseded, ten FIDELITY rows with excerpts E-129 to E-138, and the CHANGELOG line.

## Collision numbers seen

| Case | Result |
|---|---|
| Player at 100 m/s into a Krait at rest (energy 80), 200 m ahead | contact on tick 135; the player takes 18.6583 (forward shield 128 to 109.34, energy unchanged, cabin unchanged), the Krait takes 42.9475 (80 to 37.05); the player's drift becomes +65.912 m/s (backwards), the Krait's velocity -100 m/s; no further hit over 600 ticks with the engines idle |
| Player at 350 m/s into the same Krait | contact on tick 38; the player takes 228.5639 (forward shield 128 to 0, energy 256 to 155.44), the Krait takes 526.1074 and dies through `killShip` credited to the player (`shipDestroyed` 101, killer 100), releasing 2 debris pieces; the inelastic reversal leaves the player's drift at 0 |
| Player at 20 m/s into a pod | the pod takes `214,737.69 x 400 / 5e7` = 1.72 and is removed; the player's share, 0.008, is below the 0.05 floor |
| Player at 10 m/s into a pod | the pod takes 0.4295 and survives at 0.5705 |
| Two Kraits (energy 10) closing at 100 m/s | both reach 0 on the same tick; `shipDestroyed` gives [lower id, killer = higher id] and [higher id, killer = `NO_ENTITY`]: the existing same-tick rule (the D-10 asymmetry) |

## Task Commits

1. **Task 1 (tracer): the player rams a Krait, once, end to end.** `f173084` (test, RED), then `aa869eb` (feat, GREEN). Tracer gate in auto mode: I reran the Task 1 verify after GREEN (6 files and the guards, 408 tests passed; typecheck clean) before Task 2.
2. **Task 2: ships, pods and plates, kills and debris, the exclusions and the app opt-in.** `51794d4` (test, RED), then `8674c1c` (feat, GREEN, with the CHANGELOG line).
3. **Task 3: the decision rows and the remote gates.** `4ad3445` (docs).

## TDD Gate Compliance

- **RED 1:** `docker compose run --rm -T test npx vitest run tests/sim/combat/collision-stage.test.ts -t "through stepSim" --reporter=tap-flat` exited 1. The target `through stepSim: damages each side once...` failed on `expected -1 to be greater than 0`: the stub stage queues nothing, so the ram produces no hit. Classifier: `RED_EVIDENCE_OK / target_test_failed`. A first attempt targeted the `toEqual` case and was refused as `invalid_record`, because multi-line diffs break TAP. The RED commit also carried the type skeleton (`HitRecord.kind` and the ledger's scrape branch, `PLAYER_MASS_KG`, `CombatOptions.collisions`, the stub stage).
- **RED 2:** `... -t "rams a pod above" --reporter=tap-flat` exited 1. The target failed on `expected -1 to be greater than 0`: pods were not colliders yet. Classifier: `RED_EVIDENCE_OK / target_test_failed`.
- Each GREEN commit follows its RED commit. No REFACTOR commit was needed.

## Twin hashes

No twin value moved: `HASH_60_AFTER_KILL` (tick-parity) and `TWIN_HASH_60_AFTER_KILL` (combat.spec) passed unchanged in Node and in the remote browser run. No pin was edited, so the standing owner approval was not used.

## Tripwires evaluated (none triggered)

- `2026-11-18-mutual-kill-credit-symmetry`: rams create credits and make same-tick mutual kills routine (pinned by the two-Krait case). Nothing reads credits, so it is not triggered; plan 18-12 adds rams to the todo as a producer.
- `2026-11-18-narrow-kill-time-ship-target-lost`: no second `onEvent` handler was added.
- `2026-11-17-skip-shiphit-for-a-doomed-target`: scrape records emit `shipHit` as laser records do, and no consumer exists.
- `2026-11-19-player-ident-lock-in-target-targets-self`: not touched.
- `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20` is in `collide.ts`; plan 18-18 adds its guard and todo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `HitRecord.kind` broke two literals in `tests/sim/combat/step.test.ts`**
- **Found during:** Task 1. `stationRecord` and `buoyRecord` build `HitRecord`s and failed the typecheck once `kind` was required.
- **Fix:** both literals gained `kind: "laser"`. The file is not in the plan's list; it is in Task 1's verify.
- **Committed in:** `f173084`.

**2. [AGENTS.md rule] The CHANGELOG line shipped with the app opt-in (Task 2), not in Task 3**
- AGENTS.md requires a user-visible change and its CHANGELOG line in the same commit. Collisions become visible when `buildStepOptions` sets the flag, so the line is in `8674c1c`.

**3. [Rule 2 - Orchestrator note] Per-body call order (`runContactCalls`, a new export)**
- The plan resolves each pair once, in (rank of self, rank of other). The orchestrator relayed 18-20's finding: Oolite's separating call does not remove self from the other's list. The stage therefore keeps both lists, and the other calls in its own turn. The order of the first calls is still the plan's (rank of self, rank of other).
- In Wegolite the reverse call sees the same state and also separates, so the 1 m/s push measured in 18-20 does not appear (see Issues). This is a FIDELITY divergence row.
- **Committed in:** `aa869eb`.

**4. Signature and subentity choices**
- `resolveCollisions` has no `layout` argument, because nothing reads it yet.
- A subentity contact routes its damage to the parent's id, and no collider of this plan has a subentity. Both are listed under key-decisions.

**5. Test-only adjustments while writing the cases**
- The `options()` helper used a default parameter, so `undefined` turned collisions on. It now uses `null` for "absent".
- The plate-and-pod case first used 30 m/s, where both damages are below the 0.05 floor and no record is queued. It now uses 300 m/s, centres 3 m apart.
- The mutual-kill Kraits first started apart and braked to rest before they touched. They now start overlapping.
- The cube case used a mass of 1e6 to clear the floor.

**Total deviations:** 1 blocking fix, 1 AGENTS.md ordering, 1 orchestrator-driven addition, and test-only adjustments. **Impact:** no scope change. No frozen threshold, detector, acceptance file or browser spec was touched.

## Issues Encountered

- **18-20's anti-conjoin push is not reproduced.** In Oolite the buoy's own call ran later in the same frame, after motion. It found zero relative speed and pushed the player away at 1 m/s. Wegolite's stage runs once after every body has moved, so the reverse call is symmetric with the first. Reproducing it would mean interleaving collision with each body's motion, which is an architectural change (Rule 4) that I did not make. It is recorded as a divergence in FIDELITY ("Each body runs its own collision list"). Plan 18-18, which brings in the buoys, should note it.
- **A first full `test` run timed out once** in `tests/guards/tools-determinism.test.ts` (an ESLint probe hit its 30 s limit while other containers ran in parallel). That file passed on its own, and a second full run with nothing else running passed.
- **A scratch run with `vitest --root /`** started scanning the filesystem and was stopped. The collision numbers above come from a scratch `tsx` probe under `/tmp`, mounted at `/scratch`. Nothing entered the repository.
- `git diff 76229f5 -- tests/e2e/combat.spec.ts` is not empty, but the diff comes from plans 18-05 and 18-06 (their sanctioned re-pins). This plan changed nothing under `tests/e2e`, `tests/golden/world` or `tests/acceptance` (`git diff --quiet b0d6e69 -- tests/golden/world tests/e2e` exits 0).

## Verification

- `docker compose run --rm test npx vitest run tests/sim/combat tests/sim/world tests/sim/dock-integrated.test.ts tests/app/session/sim-driver.test.ts tests/app/session/tick-parity.test.ts tests/app/session/tick-flyers.test.ts`: 50 files, 1,972 passed, 1 skipped.
- `docker compose run --rm test` (coverage): 257 files, 6,976 passed, 10 skipped, exit 0.
- `docker compose run --rm lint`: exit 0. `docker compose run --rm typecheck`: exit 0, no `error TS`.
- The FIDELITY contract with `OOLITE_SRC` set to a `git archive 7437f22 src` extract: 9 of 9, every excerpt verbatim.
- **Remote acceptance (QUAL-11):** `exit=0 elapsed=78s snapshot=4ad3445`, 21 of 21.
  - Every failure counter is 0 on all 20 seeds.
  - The totals are unchanged from 18-17: arrivals 40 / 40 / 40, AVOID_COLLISION entries 23, attack ticks near the player 61,662, stuck windows 175, frozen windows 293, minimum station clearance 2,713.00 m, minimum hull clearance 41.41 m.
  - This only checks that the frozen worlds still match: the harness never sets `collisions`.
- **Remote `verify`:** `exit=0 elapsed=199s snapshot=4ad3445`. Inside: 257 files, 6,976 passed, and the e2e smoke subset passed 27 of 27.
- **Remote traffic-on specs** (`combat`, `traffic`, `tick-hook`, `npc-flight`): `exit=0 elapsed=70s snapshot=4ad3445`, 10 passed.
- **Acceptance criteria:**
  - The `export function (resolveCollisions|colliderRank)` count is 2.
  - `step.ts` has 2 non-comment `resolveCollisions` lines.
  - The `PLAYER_MASS_KG` literal appears once.
  - `ledger.ts` has 2 non-comment `routeScrapeDamage` lines.
  - `killer|shipHit|canScoop` in `collide.ts` prints nothing.
  - `collisions: true` appears once in `step-options.ts`.
  - `collide.ts` has 2 non-comment `debrisMassOf` lines.
  - `MAIN_STATION_ID|"wreckage"` in the non-comment code of `collide.ts` prints nothing.
  - `tests/acceptance` is unchanged since `76229f5`.
  - "Collisions follow Oolite's collideWithShip" appears once in PROJECT.md.
  - `PD-05` appears in FIDELITY.md.
- CBT-18 stays open in REQUIREMENTS.md: plans 18-18, 18-19, 18-21 and 18-12 still declare it.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- Plan 18-18 can add the buoys as colliders: `gatherColliders` gets a static branch, and a subentity contact needs the buoy subentity's id for `dam2`.
- Plan 18-18 should also weigh the 18-20 reverse-call note above. The nav buoy sits 10 km ahead of the dock on the launch axis, so a straight departure will hit it once buoys collide (Pitfall 7).
- Plan 18-19 extends the blast. Plan 18-21 runs a populated collisions-on scenario.

## Self-Check: PASSED

- FOUND: `tests/sim/combat/collision-stage.test.ts`, `src/sim/combat/collide.ts`
- FOUND commits: `f173084`, `aa869eb`, `51794d4`, `8674c1c`, `4ad3445` (ancestors of HEAD)

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-20*
