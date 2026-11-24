---
phase: 18-stations-buoys-and-collisions
plan: 19
subsystem: simulation
tags: [blast, explosion, dealMomentumWithinDesiredRange, addImpactMoment, buoys, drift, oracle, float32]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "18-03 blast fixtures (blastReference); 18-10 player drift and braking; 18-11 PLAYER_MASS_KG and the collision stage; 18-14 World.buoys; 18-15 the buoy subentity; 18-17 ship and buoy drift braking; 18-18 buoy colliders and NAV_BUOY_HULL_MASS use"
provides:
  - "blastImpulse: the one per-receiver blast rule (the C's float in-range test with the receiver's radius, d2 floored at 0.1, dv along the unit vector from the source)"
  - "blastFrom: one exploding body pushes the live buoys, the in-flight player, live NPC ships, pods, plates and wrecks, in ascending id, clamped"
  - "BlastPush, BlastBody, BlastSource; DebrisContext.player, .playerPush, .layout"
  - "sources: a destroyed pod or plate (killShip), a destroyed buoy as two sources (blastBuoy), a buoy subentity on its detachment tick (blastBuoySubentity from resolveShots)"
  - "BUOY_SUBENTITY_RADIUS 25.8226470947265625 (OOMesh's rule over oolite_buoy_subents.dat)"
  - "resolveShots adds the accumulated push to player.drift after the kill loop"
affects: [18-12, phase-20]

actuals:
  tokens: 22911
  tasks: 3
  commits: 6
plan_head_before: 9bd9f6a518d2eb38a1369f19ee2bb9d10491bb86
plan_head_after: f2aa997434ea9e83767f70348951513a99c139b0

tech-stack:
  added: []
  patterns:
    - "A blast source is (position, mass, radius); every receiver goes through blastImpulse, so the oracle consumer and the world pass test one rule"
    - "The player's share of the world's writes is a caller-owned accumulator added to FlightState once, after the kill loop"
    - "A subentity's detachment is read as before/after energy around applyLedger, so no ledger edit was needed"

key-files:
  created:
    - tests/sim/world/blast.oracle.test.ts
  modified:
    - src/sim/world/debris.ts
    - src/sim/world/kill.ts
    - src/sim/combat/step.ts
    - src/sim/sim.ts
    - tests/sim/world/debris.test.ts
    - tests/sim/world/kill.test.ts
    - tests/sim/world/debris-cadence.test.ts
    - tests/sim/combat/step.test.ts
    - .planning/PROJECT.md
    - FIDELITY.md
    - CHANGELOG.md

key-decisions:
  - "The blast's in-range test follows the C's float EntityInRange (cr = f(f(f(r_src) x 2.5) + f(r_rcv)), |p|^2 < f(cr^2)); the push magnitude stays in double as Phase 16 ported it (within about 1e-7 of the C's float, every 18-03 fixture passes at 1e-6), so no existing debris velocity, pin or twin hash moved"
  - "BUOY_SUBENTITY_RADIUS is a literal (the static hull artifact carries no subentity radius), pinned to the 18-03 fixture and to OOMesh's rule over the vendored mesh; the subentity's absolute position is the buoy's centre because its authored offset is (0, 0, 0), pinned by a test"
  - "A buoy subentity that this tick's records bring to 0 blasts before the kill loop, so a buoy destroyed on the same tick then blasts its hull alone, in the C's order"
  - "A burnt-out wreck releases no blast (Oolite's takeHeatDamage destroys it through getDestroyedBy, whose explosion deals momentum): recorded as a FIDELITY divergence, not ported"

patterns-established:
  - "Blast receivers and sources live in debris.ts; kill.ts and resolveShots only choose the source"

requirements-completed: [CBT-18]

coverage:
  - id: D1
    description: "The explosion blast pushes the in-flight player: a Krait killed inside the player's radius throws it clear at the 18-03 floor fixture's speed, then the drift brakes to rest; no push out of range, while launching or docked, or without debris content"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/debris.test.ts#throws the player clear by the 18-03 floor fixture, then the drift brakes to rest"
        status: pass
      - kind: unit
        ref: "tests/sim/world/debris.test.ts#never pushes a launching or a docked player, and nothing without debris content"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every 18-03 blast fixture (11) passes through blastImpulse and through the world pass blastFrom"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/blast.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ships pushed by their hull mass, buoys by their live mass, pods and plates as sources, a dying buoy's two sources in the C's order, the subentity's blast at detachment, the clamp, the station never moved"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/kill.test.ts#the blast's sources and receivers (D-03, PD-02)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#a buoy subentity's blast at detachment (D-03, ShipEntity.m:7895-7904)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A kill pushing the player, a Shuttle and the nav buoy hashes equal at 30, 60 and 144 Hz; the frozen acceptance worlds are unchanged"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/debris-cadence.test.ts#gives the same hashes and pushes at 30, 60 and 144 Hz"
        status: pass
      - kind: integration
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance (exit=0 elapsed=82s snapshot=f2aa997)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Decision and fidelity records: the Phase 16 blast row superseded, the D-03 row, FIDELITY rows and excerpts E-145 to E-150"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/contract/fidelity.test.ts (OOLITE_SRC = git archive 7437f22, 9 of 9)"
        status: pass
    human_judgment: true
    rationale: "Whether the recorded divergences (station mechanism, launching player, burnt-out wreck) are acceptable is an owner reading at the phase-close FIDELITY walk (18-12)"

duration: 40min
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 19: The Explosion Blast on Ships, Buoys and the Player Summary

**Oolite's `dealMomentumWithinDesiredRange` now pushes every movable body: live NPC ships by their hull mass, the live buoys by their live mass, the in-flight player (its push added to the drift after the kills) and debris; pods, plates, a dying buoy (subentity first, then the hull at `NAV_BUOY_HULL_MASS`) and a detaching buoy subentity are blast sources. All 11 blast fixtures from 18-03 pass. No pin moved, and QUAL-11 is unchanged to the last digit.**

## Performance

- **Duration:** about 40 min (first edit 2026-11-20T16:24Z, last commit 16:51Z, after about 10 min of reading)
- **Tasks:** 3 of 3 (Tasks 1 and 2 TDD, Task 1 a tracer)
- **Files:** 12 (1 created, 11 modified)

## Accomplishments

- `blastImpulse(source, position, radius, mass)` is the rule for one receiver:
  - The receiver is in range when `|p|^2 < f(cr^2)`, with `cr = f(f(f(r_src) x 2.5) + f(r_rcv))`. This is Oolite's float `EntityInRange` (`Universe.m:5862-5868`), so the two boundary fixtures that sit one ulp apart split exactly as in the C.
  - `d2 = |p|^2 - r_rcv^2`, floored at 0.1.
  - `dv = 0.125 m_src x 2.5 r_src / d2 / m_rcv`, along the unit vector from the source.
  - A receiver at the source's centre gets the zero vector.
- `blastFrom` passes over the receivers in ascending id:
  - the buoys (4, 5) with a layout, unless destroyed: `NAV_BUOY_MASS`, or `NAV_BUOY_HULL_MASS` once detached, then the layout radius, `buoyPosition` and `World.buoys.<key>.velocity`;
  - the player (100), into `BlastPush`;
  - live ships with a hull-table mass;
  - pods, plates and wrecks.
- Every write is clamped per component at `MAX_ENTITY_VELOCITY`. A zero push writes nothing.
- Sources:
  - ships, as in Phase 16;
  - pods and plates, through `killShip`'s cargo branch (`blastDebrisPiece`);
  - a destroyed buoy, through `destroyBuoy(..., debris)` → `blastBuoy`: the attached subentity from the buoy's centre (`BUOY_SUBENTITY_MASS`, `BUOY_SUBENTITY_RADIUS`), then the hull (`NAV_BUOY_HULL_MASS`, layout radius);
  - a buoy subentity on the tick it detaches. `resolveShots` compares the subentity's energy before and after `applyLedger` and blasts before the kill loop.
- `resolveShots` builds the context:
  - the layout, always;
  - the player's body (`PLAYER_COLLISION_RADIUS_M`, `PLAYER_MASS_KG`) and a zeroed accumulator, only in flight.
  - After the kills, `applyPlayerPush` adds the accumulator to `player.drift`, clamped.

## Blast numbers against the fixtures

| Fixture | Port result | Through |
|---|---|---|
| `blast-krait-player-floor-10m` | the player's drift after the kill tick is +z 68.1487 m/s, within 1e-6 of \|(40.889225006103516, 0, 54.51896286010742)\| (the Krait sits 60 m ahead, which is also floored, because the pulse cannot hit it from inside its hull). The drift then brakes by 32/120 per tick and is 0 after `ceil(68.1487 / 0.26667)` ticks | `stepSim`, `debris.test.ts` |
| all 11 (`krait-player-floor-10m`, `krait-shuttle-touching`, `krait-player-touching`, `pod-pod-8m`, `pod-pod-5m-floor`, `buoy-dying-with-subentity`, `krait-receiver-at-range-plus-radius-strict`, `krait-receiver-just-inside-range`, `krait-receiver-at-victim-centre`, `krait-plate-out-of-range`, `krait-several-receivers`) | in range ⇔ the fixture's `inRange` for every victim/receiver pair; every `dv` and every sum within the fixture's 1e-6 relative tolerance | `blastImpulse` and `blastFrom`, `blast.oracle.test.ts` (26 tests) |
| `blast-pod-pod-8m`, `blast-pod-pod-5m-floor` | a pod killed through `killShip` with debris content gives the neighbour (0, 0, 0.0597) and the floored (10.872, 14.497, 0) | `kill.test.ts` |
| `blast-buoy-dying-with-subentity` | `destroyBuoy` with the subentity attached: pod (0.7739, 1.0319, 0), player push z -0.0126736. Detached: the hull contributions alone | `kill.test.ts` |

Mutation checks (each reverted):
- A double in-range test fails the two boundary fixtures.
- Using the victim's radius in `d2` fails 10 of 26 cases.

## Task Commits

1. **Task 1 (tracer): the player pushed.**
   - `c902394`: test, RED. The floor case failed on `drift z 0 vs 68.14870529174809`; the launching/docked control failed on "not deeply equal zero".
   - `7a70a29`: feat, GREEN.
   - Tracer gate (auto mode): I re-ran the verify (4 files, 195 tests) and the typecheck before Task 2.
2. **Task 2: ships and buoys pushed, every source.**
   - `cedc253`: test, RED, 21 failing: `blastFrom is not a function`, `BUOY_SUBENTITY_RADIUS` undefined, the no-push expectations.
   - `129cd6a`: feat, GREEN, with the CHANGELOG line.
3. **Task 3: records.**
   - `e15ec59`: fix, the exact float literal for lint.
   - `f2aa997`: docs, PROJECT.md and FIDELITY.

`tdd_mode` is off, so the RED classifier was not run.

## Re-pins

None. These passed unchanged:
- `HASH_60_AFTER_KILL` (the Node twin, `tests/app/session`) and `TWIN_HASH_60_AFTER_KILL` (the remote `combat.spec`);
- `debris-cadence`, `npc-vs-npc.scenario`, `flight-hash-pins`, `world-cadence` and every `tests/sim` pin.

The standing owner approval was not used. `git diff --quiet 76229f5 -- tests/golden/world/flight-hash-pins.json` exits 0. Nothing under `tests/e2e` or `tests/acceptance` was edited.

## Remote runs

- **QUAL-11 acceptance:** `exit=0 elapsed=82s snapshot=f2aa997`, 21 of 21.
  - Every seed matches 18-21's run exactly: attack ticks, AVOID_COLLISION, stuck and frozen windows, and both clearances.
  - Every failure counter is 0.
  - Totals: arrivals 40/40/40, AVOID_COLLISION 23, attack ticks 61,662, stuck windows 175, frozen windows 293.
  - This is a frozen-worlds check only: the harness has no debris content, so no blast runs in it.
- **Traffic-on specs** (`combat`, `traffic`, `tick-hook`, `npc-flight`): `exit=0 elapsed=70s snapshot=f2aa997`, 10 passed.
- No `verify`: the plan touches no browser-facing code (gate policy).

## Deviations from Plan

**1. [Rule 3 - Blocking] The subentity radius is not in the static artifact.** The plan says "its radius as the static artifact gives it", but `ships-static-hulls.json` carries only the subentity's key, mass, octree and position. Its octree radius (24.35) is not the collision radius.
- **Fix:** I added the literal `BUOY_SUBENTITY_RADIUS` (the 18-03 derivation). Tests pin it to the fixture and to OOMesh's rule over the vendored `.dat`.
- **Commit:** `129cd6a`.

**2. [Rule 2] The tracer's geometry.** A pulse cannot hit a Krait from inside its hull, so the player cannot fire from 10 m. The Krait is 60 m ahead, which is also inside the player's radius and also takes the floor. The test compares against the fixture's floored speed along the unit vector, as the behaviour states.

**3. Files outside the list:**
- `src/sim/sim.ts`: a doc line. The world now writes the FlightState in two places.
- `tests/sim/combat/step.test.ts`: the detachment blast test needs that file's subentity-beam helpers.

**4. [AGENTS.md rule] The CHANGELOG line shipped with Task 2's feat commit,** not with Task 3, because a user-visible change and its line go in one commit. Task 1's commit carried the player push without it; the line landed one commit later, inside the plan.

**5. [Rule 1] Lint.** `25.822647094726562` tripped `no-loss-of-precision`. I wrote the exact float `25.8226470947265625` instead; the value is the same. Commit `e15ec59`.

**6. A divergence the plan did not name.** A wreck that burns out gets no blast. In Oolite, `takeHeatDamage` destroys it and the explosion deals momentum. I recorded this as a FIDELITY divergence (E-150) and in the PROJECT row, and did not port it.

**Total:** 2 auto-fixes (Rules 1 and 3), 1 geometry adjustment, 2 extra files, 1 ordering, 1 new recorded divergence. **Impact:** no scope change; no frozen threshold, detector or spec was touched.

## Issues Encountered

None blocking. The FIDELITY contract first failed because my cross-reference quotes came before the PROJECT quote in two divergence cells. The contract reads the first quoted string, so I reworded them.

## Verification

- Targeted: `tests/sim/world tests/sim/combat tests/oracles/combat/response tests/guards` gave 71 files, 2,230 passed. `tests/app/session tests/sim` gave 141 files, 4,120 passed.
- `docker compose run --rm test` (coverage): 268 files, 7,091 passed, 10 skipped, exit 0.
- `lint`: exit 0, Prettier clean. `typecheck`: exit 0, no `error TS`.
- FIDELITY contract with `OOLITE_SRC` set to a `git archive 7437f22 src` extract: 9 of 9, every excerpt verbatim.
- Acceptance criteria:
  - `export interface BlastPush`: 1.
  - The "Ships and the player are never pushed" text: absent.
  - `playerPush` in non-comment `step.ts`: 5 lines.
  - The `kind === "ship"` check in non-comment `debris.ts`: 1.
  - `blast.json` in the oracle test: 3.
  - `flight-hash-pins.json` unchanged.
  - The PROJECT row phrase: 1. The CHANGELOG phrase: 1.
  - In FIDELITY: `1159-1163` 3, `Entity.m:1038` 1, `8115-81` 2.
- CBT-18 stays open in REQUIREMENTS.md: `requirements.ready-ids` reports it blocked, because 18-12 still declares it.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- 18-12 (phase close) should walk the three recorded divergences: the station's mechanism, the launching player and the burnt-out wreck.
- Phase 20 (player death) inherits the blast as the survivor's rebound after a lethal ram. `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20` and its tripwire are untouched.

## Self-Check: PASSED

- FOUND: `tests/sim/world/blast.oracle.test.ts` and every modified file.
- FOUND commits `c902394`, `7a70a29`, `cedc253`, `129cd6a`, `e15ec59`, `f2aa997` as ancestors of HEAD.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-20*
