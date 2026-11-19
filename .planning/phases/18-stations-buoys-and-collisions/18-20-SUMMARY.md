---
phase: 18-stations-buoys-and-collisions
plan: 20
subsystem: fidelity-measurement
tags: [oolite-reference, real-oolite, dock-mouth, collision, buoy-ram, jump-blockage, PD-03, fidelity]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "18-02 dock-mouth fixtures (tests/oracles/combat/geometry/fixtures/dock-mouth.json), 18-03 collideWithShipReference and the braking references"
provides:
  - "FIDELITY.md subsection 'Phase 18 real-Oolite measurements (PD-03)': the dock-mouth decision of five edge: false fixtures, the player-against-buoy ram and the pod and plate blockage rule, each with session ids, inputs, observed and expected values and a verdict"
  - "Real-hull octree contact evidence for 18-18: Cobra against buoy first touches between 79.8 m and 92.9 m centre to centre (sphere sum 131.83 m)"
  - "D-08 evidence for 18-07: a CLASS_CARGO ship blocks by 0.1 x mass > d^2 alone; pod 9.967 m, plate 5.229 m"
affects: [18-04, 18-07, 18-09, 18-11, 18-16, 18-17, 18-18, 18-12]

actuals:
  tokens: 4230
  tasks: 3
  commits: 3
plan_head_before: ebe8e2380bab2b65fcbdef1d0cad919b5064418b
plan_head_after: 0cc8031df0d7e08c33b5db23d3f2bd5aabf94a87

tech-stack:
  added: []
  patterns:
    - "Real-Oolite probe: one CONFIG per session, generated OXP under /tmp, frame callbacks place entities after [UNIVERSE update:] so the next frame's player update sees exactly the logged sample"
    - "Per-contact oracle replay: feed the reference the callback state before each contact plus the contact frame's dt, then apply the C's post-contact braking and compare with the next callback"

key-files:
  created:
    - .planning/phases/18-stations-buoys-and-collisions/18-20-SUMMARY.md
  modified:
    - FIDELITY.md

key-decisions:
  - "Shot victim from the shipAttackedOther event of the firing frame: the main station recharges its 15-point laser loss back to 25,000 within the frame, so its energy drop is invisible"
  - "A fresh bracket barrel is spawned at every frame callback: Oolite's dock takes in a barrel left in the slot within one or two frames (DockEntity.m:695-713); two slot sessions with a persistent barrel were discarded as INCONCLUSIVE set-ups"
  - "The buoy ram is checked contact by contact against collideWithShipReference at the observed pre-contact state and frame time; every full contact matched to 0.000 m and 0.001 m/s"
  - "The PD-02 figures quoted in 18-CONTEXT (about 10 m and about 122 m of carry, a 631 m/s rebound) are refuted by the measurement, in the 18-03 oracle's favour. They are planning-text figures, not fixtures, so no mismatch todo was opened"

patterns-established:
  - "Engine at rest for a measurement: player.ship.maxSpeed = 0 and speed logged 0 on every frame (quick task 261117-lka's method)"

requirements-completed: [CBT-17, CBT-18]

coverage:
  - id: D1
    description: "Dock-mouth decision of five edge: false fixtures (slot, faceplate, hull, far miss, buoy hull) bracketed on real Oolite, nine one-shot sessions, nine SAME"
    requirement: CBT-17
    verification:
      - kind: other
        ref: "rg -c 'PD-03' FIDELITY.md (1); rg -c '\\bdock-[a-z0-9-]+' FIDELITY.md (11)"
        status: pass
      - kind: manual_procedural
        ref: "tools/oolite-reference/run-remote.sh sessions 2026-11-19T19:26:14Z to 19:31:29Z (exit=0 each)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Player-against-buoy ram on real Oolite (100 m/s from two axes, 350 m/s real and with the player's energy raised) compared with the 18-03 reference at the observed closing speed and frame time: SAME on damage, both rebounds, displacement; first-contact centre distances recorded"
    requirement: CBT-18
    verification:
      - kind: other
        ref: "rg -c 'buoy ram' FIDELITY.md (2)"
        status: pass
      - kind: manual_procedural
        ref: "scratch replay /tmp/pd03-1820/analysis/ram.ts in the test container against tests/oracles/combat/response/reference.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pod and plate blockage rule on real Oolite: a CLASS_CARGO surrogate (R 400.04 m) blocks at 0.95 R and not at 1.05 R"
    requirement: CBT-18
    verification:
      - kind: other
        ref: "rg -c 'pod and plate blockage' FIDELITY.md (1)"
        status: pass
      - kind: other
        ref: "docker compose run --rm lint (exit 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "No Oolite output, OXP, steps file, screenshot or log in the repository; no fixture, tolerance or port changed"
    verification:
      - kind: other
        ref: "git status --porcelain -- '*.oxp' '*Latest.log' '*.png' '*.steps' (empty); git log -F --grep='(18-20)' --format=%h -- tests/oracles src (empty)"
        status: pass
    human_judgment: false

duration: 34min
completed: 2026-11-19
status: complete
---

# Phase 18 Plan 20: Real-Oolite Measurements (PD-03) Summary

**On Oolite 1.93.1-255 the dock-mouth brackets, the buoy ram and the cargo-class blockage rule all agree with the 18-02 and 18-03 oracles. There are 15 SAME verdicts, 1 KNOWN (D-08) and no MISMATCH. The measurements also settle the three PD-02 figures that 18-03 disputed, in the oracle's favour: the buoy is carried by the nudge, a 350 m/s ram destroys it, and the player gets no net rebound.**

## Performance

- **Duration:** about 34 min
- **Started:** about 2026-11-19T19:12Z
- **Completed:** 2026-11-19T19:46Z
- **Tasks:** 3 of 3
- **Files modified:** 1 (`FIDELITY.md`) plus this SUMMARY
- **Reference sessions:** 18, one at a time; nothing else ran on the remote meanwhile

## Verdict table (consumers' preconditions read this)

| Claim | Fixture or quantity | Observed (Oolite) | Expected | Verdict |
|-------|---------------------|-------------------|----------|---------|
| 1 dock mouth | `dock-slot-through-dock-back-wall` | beam reaches 2,713.730 m, stopped before 2,785.757 m | dock, 2,749.7439 +/- 29.2150 | SAME |
| 1 dock mouth | `dock-faceplate-beside-slot-y` | reaches 2,465.356, stopped before 2,541.324 | faceplate, 2,503.3400 +/- 31.1858 | SAME |
| 1 dock mouth | `dock-hull-alone-from-minus-x` | reaches 2,464.016, stopped before 2,535.984 | hull, 2,500.0000 +/- 29.1858 | SAME |
| 1 dock mouth | `dock-far-miss` | target beyond the station hit, station untouched | none | SAME |
| 1 dock mouth | `dock-buoy-hull-back-face` | reaches 2,942.378, stopped before 2,969.558 by the buoy hull (energy -14.64) | buoy hull, 2,955.9680 +/- 6.7909 | SAME |
| 2 buoy ram | closing speed at first contact | 79.7814 / 75.0558 m/s (100 m/s set), 344.26 to 344.78 m/s (350 set) | drift braked at 32 m/s^2 from the set speed | SAME |
| 2 buoy ram | player damage, first contact | 88.620 / 78.399 (+ one frame of recharge) | dam1 88.944 / 78.720 | SAME |
| 2 buoy ram | buoy damage, first contact | 27.012 / 23.873 (+ one frame of recharge) | dam2 27.336 / 24.194 | SAME |
| 2 buoy ram | player rebound incl. braking | -138.722 / -130.249 m/s | -138.722 / -130.249 m/s | SAME |
| 2 buoy ram | buoy rebound and displacement | nudge 129.333 / 120.490 m, braked to 0 in the frame; 107.171 / 96.776 m net after all contacts | same, position error 0.000 m | SAME |
| 2 buoy ram | 350 m/s, player energy 5,000 | buoy destroyed, player dv = braking only (338.558 m/s) | otherDestroyed, no nudge, net dv 0 (338.584 m/s) | SAME |
| 2 buoy ram | 350 m/s, real | player and buoy both destroyed | selfDestroyed and otherDestroyed | SAME |
| 2 buoy ram | first-contact centre distance (octree evidence for 18-18) | 91.607 / 79.827 m (100 m/s); 88.139, 92.946, 87.211 m (350 m/s) | recorded, no fixture | SAME (recorded) |
| 3 blockage | cargo-class surrogate at 0.95 R (380.038 m) | blocked | blocked | SAME |
| 3 blockage | cargo-class surrogate at 1.05 R (420.042 m) | not blocked (insufficient fuel) | not blocked | SAME |
| 3 blockage | pod 9.967 m and plate 5.229 m blockage in Oolite against Wegolite's D-08 | Oolite blocks by mass alone | Wegolite: pods and plates never block | KNOWN (D-08) |

There is no MISMATCH and no INCONCLUSIVE quantity, so `.planning/todos/pending/2026-11-19-oolite-measurement-mismatch.md` was not created. Two slot sessions were discarded as INCONCLUSIVE set-ups, and a clean session of the same fixture and bracket replaced them.

## Method per claim

- **Dock mouth (Task 1, tracer):** one `edge: false` fixture per winning part, with one pulse shot per session. The probe placed the weapon origin on the fixture ray, converted in the body frame of the firing frame. Frame callbacks run after the universe update and the player updates first, so the shot of frame N+1 uses the sample of callback N. A fresh barrel sat at the bracket distance on the ray. In every measured session the origin was at most 0.0008 m off the ray and the target moved 0 m. No other ship was within 200 m of the ray. The JS API does not expose the beam length: `OOLaserShotEntity` is not visible to scripts (`EntityOOJavaScriptExtensions.m:39-42`).
- **Buoy ram (Task 2):** the player started 150 m from the nav buoy on a buoy axis, with full shields, engine speed 0 and the velocity set toward the buoy. Each frame was logged. Each contact was replayed through `collideWithShipReference` by `/tmp/pd03-1820/analysis/ram.ts`, run in the `test` container. Every contact hit the hull: the subentity's energy stayed at 200.
- **Blockage (Task 3):** the 261117-lka method with a `CLASS_CARGO` surrogate (`like_ship = "barrel"`, `density = 1611`, mass 1,600,319.125, R 400.040 m).

## Findings beyond the plan's expected values

- **Oolite's nudge depends on the frame time.** The nudge is `t = 10 x getTimeDelta` (`ShipEntity.m:11138`). At the reference machine's 0.16 s frames, one 80 m/s contact carries the buoy 129 m and pushes the player 233 m toward the buoy (`self += loc x t x v1a`, `:11140-11141`). That leaves the player inside the buoy, and the C resolves it over several more contacts. At Wegolite's fixed 1/120 s the same C gives the fixture's 8.333 m nudge plus 9.583 m of braked drift.
- **Anti-conjoin with the buoy as self:** when the player's own `collideWithShip` returns early because the pair is separating faster than 1 m/s (`:11080`), the removal from the other's collision list (`:11149-11150`) is skipped. The buoy's own call in the same frame then sees zero relative speed and pushes the player away at 1 m/s (`:11096-11099`). This was observed in both 100 m/s sessions. It matters to 18-11's collision stage (both sides' collision lists) and to 18-18.

## Task Commits

1. **Task 1: dock-mouth decision on real Oolite (tracer)**: `9e945e3` (docs). Tracer gate: `rg -c "PD-03" FIDELITY.md` was rerun and returned 1, so expansion went ahead.
2. **Task 2: player-against-buoy ram**: `ceeab39` (docs)
3. **Task 3: pod and plate blockage radius**: `0cc8031` (docs)

## Reference run lines

Every run is `tools/oolite-reference/run-remote.sh --addons <dir> --steps <file> --out <dir>` from `ebe8e23` with a clean tool tree. The first run built the image (cached); the others used `--no-build`. OXPs, steps and outputs are under `/tmp/pd03-1820/` and were never committed.

| Run | Session (`start_utc`) | Last line |
|-----|-----------------------|-----------|
| dock-slot-short (discarded set-up) | 2026-11-19T19:23:29Z | exit=0 container_exit=0 elapsed=39s out=/tmp/pd03-1820/runs/dock-slot-short/out |
| dock-slot-short-2 (discarded set-up) | 2026-11-19T19:25:13Z | exit=0 container_exit=0 elapsed=36s out=/tmp/pd03-1820/runs/dock-slot-short-2/out |
| dock-slot-short-3 | 2026-11-19T19:26:14Z | exit=0 container_exit=0 elapsed=35s out=/tmp/pd03-1820/runs/dock-slot-short-3/out |
| slot-beyond | 2026-11-19T19:27:17Z | exit=0 container_exit=0 elapsed=35s out=/tmp/pd03-1820/runs/slot-beyond/out |
| face-short | 2026-11-19T19:27:52Z | exit=0 container_exit=0 elapsed=36s out=/tmp/pd03-1820/runs/face-short/out |
| face-beyond | 2026-11-19T19:28:28Z | exit=0 container_exit=0 elapsed=35s out=/tmp/pd03-1820/runs/face-beyond/out |
| hull-short | 2026-11-19T19:29:03Z | exit=0 container_exit=0 elapsed=36s out=/tmp/pd03-1820/runs/hull-short/out |
| hull-beyond | 2026-11-19T19:29:44Z | exit=0 container_exit=0 elapsed=35s out=/tmp/pd03-1820/runs/hull-beyond/out |
| miss-none | 2026-11-19T19:30:19Z | exit=0 container_exit=0 elapsed=35s out=/tmp/pd03-1820/runs/miss-none/out |
| buoy-short | 2026-11-19T19:30:54Z | exit=0 container_exit=0 elapsed=34s out=/tmp/pd03-1820/runs/buoy-short/out |
| buoy-beyond | 2026-11-19T19:31:29Z | exit=0 container_exit=0 elapsed=35s out=/tmp/pd03-1820/runs/buoy-beyond/out |
| ram100-fwd | 2026-11-19T19:34:26Z | exit=0 container_exit=0 elapsed=34s out=/tmp/pd03-1820/runs/ram100-fwd/out |
| ram100-right | 2026-11-19T19:35:46Z | exit=0 container_exit=0 elapsed=34s out=/tmp/pd03-1820/runs/ram100-right/out |
| ram350-fwd | 2026-11-19T19:36:20Z | exit=0 container_exit=0 elapsed=31s out=/tmp/pd03-1820/runs/ram350-fwd/out |
| ram350-fwd-boost | 2026-11-19T19:36:51Z | exit=0 container_exit=0 elapsed=34s out=/tmp/pd03-1820/runs/ram350-fwd-boost/out |
| ram350-fwd-2 | 2026-11-19T19:39:19Z | exit=0 container_exit=0 elapsed=35s out=/tmp/pd03-1820/runs/ram350-fwd-2/out |
| block-095 | 2026-11-19T19:41:40Z | exit=0 container_exit=0 elapsed=35s out=/tmp/pd03-1820/runs/block-095/out |
| block-105 | 2026-11-19T19:42:15Z | exit=0 container_exit=0 elapsed=35s out=/tmp/pd03-1820/runs/block-105/out |

No Wegolite remote gate ran (plan gate policy: documentation only).

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The dock took in the slot bracket target**
- **Found during:** Task 1
- **Issue:** A barrel held inside the slot (the "short" bracket of `dock-slot-through-dock-back-wall`, 286 m from the centre) was taken in by the dock within one or two frames (`DockEntity.m:695-713`). The shot then went to the station.
- **Fix:** spawn a fresh barrel at every frame callback and remove the old one. The fresh barrel is hittable at the next shot because the player fires before the collision pass. The two sessions with a persistent barrel (19:23:29Z, 19:25:13Z) were discarded as INCONCLUSIVE set-ups with no verdict. All measured sessions used the fresh-barrel method.
- **Files modified:** none in the repository (probe under `/tmp`)

**2. [Rule 3 - Blocking] Engine at rest without the decelerate key**
- **Found during:** Task 2
- **Issue:** The plan asked for a steps-file decelerate key and a `waitlog` on speed 0. Quick task 261117-lka's `player.ship.maxSpeed = 0` reaches the same state with no key timing.
- **Fix:** used `maxSpeed = 0` and logged the engine speed on every frame. It was 0 on every frame before contact in all five sessions. Player braking is unaffected (thrust factor 1 while `flightSpeed <= maxFlightSpeed`, `PlayerEntity.m:3378-3385`).

**3. [Rule 2 - Missing critical] Two extra 350 m/s sessions**
- **Found during:** Task 2
- **Issue:** In real Oolite a 350 m/s ram kills the player (dam1 1,661 > 256), which the fixture masks (`destroyable: false`). The first real session's logger also failed on the dead player.
- **Fix:** added a session with the player's `maxEnergy` and energy set to 5,000. This reproduces the fixture's contract, so it is the comparison session. A repeat of the real session with a guarded logger showed both ships destroyed.

**4. [Rule 1 - Bug] Blockage radius formula in the plan**
- **Found during:** Task 3
- **Issue:** The plan wrote R = sqrt(mass / 0.1). Its own arithmetic (1.6e6 kg gives 400 m) and the C (`k x mass > d^2`) give R = sqrt(0.1 x mass).
- **Fix:** used sqrt(0.1 x mass), computed from the logged mass.

---

**Total deviations:** 4 (2 Rule 3, 1 Rule 2, 1 Rule 1). **Impact:** all of them are measurement method. No fixture, tolerance, port or test changed.

## Issues Encountered

- The `tris` winner (`dock-tris-corner-oblique`) was not measured. The plan lists the parts as dock, faceplate, hull, none and buoy hull.
- In the 350 m/s session with energy 5,000, the player's speed after contact differs from the reference by 0.026 m/s (0.008 %). This is not attributed. The same frame also carries the buoy's explosion, which this comparison does not model.

## User Setup Required

None.

## Next Phase Readiness

- No MISMATCH verdict and no mismatch todo, so the consumers' gate is open: 18-04 (dock mouth), 18-07 (D-08 row), 18-09 (octree contact), 18-16 (ram response) and 18-17 (buoy displacement).
- 18-18: compare the first-contact centre distances (Cobra nose first against the buoy: 91.607 and 79.827 m at 100 m/s, 87.2 to 92.9 m at 350 m/s; no contact at 105.1 or 92.2 m) with the stage's octree contact. The buoy's spin at contact was not controlled.
- 18-11 and 18-18: the anti-conjoin behaviour with the buoy as self (see Findings).
- 18-12 (owner): the PD-02 figures in 18-CONTEXT ("about 10 m", "about 122 m", "rebounds at 631 m/s") are measured as wrong. Decide whether to correct the CONTEXT text. The PD-02 decision itself stands.

## Self-Check: PASSED

- `FIDELITY.md` holds the PD-03 subsection: `rg -c "PD-03"` 1, `dock-` ids 11, `buoy ram` 2, `pod and plate blockage` 1.
- Commits `9e945e3`, `ceeab39` and `0cc8031` are ancestors of HEAD, and `git rev-list --count ebe8e23..HEAD` = 3.
- `docker compose run --rm lint` exit 0. The porcelain check for `.oxp`, `Latest.log`, `.png` and `.steps` is empty. No `(18-20)` commit touches `tests/oracles` or `src`.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-19*
