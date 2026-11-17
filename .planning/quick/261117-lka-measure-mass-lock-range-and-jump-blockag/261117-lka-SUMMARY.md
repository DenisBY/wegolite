---
phase: quick
plan: 261117-lka
subsystem: fidelity-measurement
tags: [oolite-reference, mass-lock, jump-blockage, fidelity]
requires: [261117-iuw, 261117-jji]
provides:
  - "Mass-lock and jump-blockage boundaries observed in a running Oolite 1.93.1-255, compared with Wegolite's predicates"
affects: [FIDELITY.md, .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md, .planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md]
key-files:
  created: []
  modified:
    - FIDELITY.md
    - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
    - .planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md
decisions:
  - "Station mass lock at exactly 25,600 m DIFFERS (Oolite unlocked, Wegolite locked): stop-and-report, no code change (MB-4, W-7)."
requirements: [WORLD-10, FLGT-04, NAV-04]
metrics:
  duration: "about 25 min"
  completed: 2026-11-17
status: complete
commits: 1
plan_head_before: 42c43940d663ef989a95a5d27c4e96ecc7800339
plan_head_after: bb7daab0cb0b79bbdd34542fc8915f5ebfd07c27
actuals:
  tokens: 30000
  tasks: 3
  commits: 1
---

# Phase quick Plan 261117-lka: Mass-lock range and jump blockage measured in a running Oolite Summary

Twenty trials and two radii measured in a headless Oolite 1.93.1-255 against Wegolite's predicates: 18 SAME, 1 KNOWN (buoy blockage, E-22), 1 DIFFERS (the station mass lock at exactly 25,600 m, reported and not fixed), radii EQUAL and ROUNDING. No code changed.

## Result in one paragraph

Oolite's readings O-1 to O-5 of the plan were all confirmed by the run. The one predicted difference happened: a spawned Coriolis at exactly 25,600 m (squared distance 655,360,000) is not mass-locked in Oolite, because the strict outer gate `zero_distance < SCANNER_MAX_RANGE2` (`PlayerEntity.m:2936`) decides for every ship, stations included. Wegolite locks there (`src/sim/flight/torus.ts:103`, `<=`). The fix is an operator, two test pins and two comments, so under MB-4 it is stop-and-report and nothing in `src/` or `tests/` changed.

## Predicates as read

Oolite 1.93.1-255 (read in `/home/opencode/git/oolite`):

- Mass lock outer gate, `PlayerEntity.m:2936`: `zero_distance < SCANNER_MAX_RANGE2 || !isShip`, strict for ships; `checkEntityForMassLock` runs only behind it (`:2941`). Inner gate `<=` at `:3037` never changes a ship's result. Stellar bodies skip the outer gate (`:3019-3030`): `dist < r^2 x factor` (2.0 sun, 4.0 planet) or `dist < (r + 25,000)^2`.
- Observable: `ALERT_FLAG_MASS_LOCK` set at `:2976-2977`, `massLocked` at `:3990-3993`, JS `player.alertMassLocked`.
- Blockage, `ShipEntity.m:12498-12536`, test at `:12528`: `k * mass > d2 && d2 < SCANNER_MAX_RANGE2` with `k = 0.1f`, centre to centre, over every ship except the player whatever its scan class; called at countdown end through `witchJumpChecklist:` (`PlayerEntity.m:6544-6560`), order blocked, no target, too far, insufficient fuel.

Wegolite at HEAD 42c4394:

- Station: `src/sim/flight/torus.ts:103` `stationDistanceSquared <= SCANNER_MAX_RANGE^2` (inclusive). Planet `:111-119`, sun `:123-131`. Buoys never lock.
- NPC: `src/sim/world/ship-field.ts:93-94` strict `<` and `NON_LOCKING_SCAN_CLASSES` (`:41-49`, buoy at `:44`).
- Blockage: `src/sim/hyperspace/countdown.ts:86-89` `WITCH_BLOCK_K * mass > d2 && d2 < range^2`; ship masses through `ship-field.ts:101-119`; the Coriolis through `CORIOLIS_STATION_MASS`; buoys never block (E-22).

## Trial comparison (Wegolite's predicate applied to Oolite's measured d^2)

Source: `/tmp/ooref-masslock/compare.txt`, produced by `/tmp/ooref-masslock/compare.sh` from the last `MEASURE-BEGIN` block of `/tmp/ooref-masslock/run-full/logs/Latest.log` (one block in the file). Every trial was `stable=true` with `others=0`.

| Kind | Trial | Oolite d (m) | Oolite d^2 | Oolite | Wegolite | Wegolite rule | Verdict |
| ---- | ----- | ------------ | ---------- | ------ | -------- | ------------- | ------- |
| ML | ctrl | none | none | unlocked | unlocked | empty point | SAME |
| ML | krait-25599 | 25599.000 | 655308801 | locked | locked | ship-field.ts:93-94 strict, CLASS_NEUTRAL locks | SAME |
| ML | krait-25600 | 25600.000 | 655360000 | unlocked | unlocked | ship-field.ts:93-94 | SAME |
| ML | krait-25601 | 25601.000 | 655411201 | unlocked | unlocked | ship-field.ts:93-94 | SAME |
| ML | coriolis-25599 | 25599.000 | 655308801 | locked | locked | torus.ts:103 inclusive | SAME |
| ML | coriolis-25600 | 25600.000 | 655360000 | unlocked | LOCKED | torus.ts:103 inclusive | DIFFERS |
| ML | coriolis-25601 | 25601.000 | 655411201 | unlocked | unlocked | torus.ts:103 inclusive | SAME |
| ML | buoy-1000 | 1000.000 | 1000000 | unlocked | unlocked | ship-field.ts:44 CLASS_BUOY never locks | SAME |
| ML | buoy-25599 | 25599.000 | 655308801 | unlocked | unlocked | ship-field.ts:44 | SAME |
| BL | ctrl | none | none | clear (insufficient_fuel) | clear | no blocker | SAME |
| BL | krait-in | 95.587 | 9136.966498 | blocked | blocked | countdown.ts:86-89, mass 93291.40625 | SAME |
| BL | krait-out | 97.587 | 9523.316439 | clear | clear | countdown.ts:86-89 | SAME |
| BL | buoy-in | 263.328 | 69341.463404 | blocked | clear | buoys never block (E-22) | KNOWN |
| BL | buoy-out | 265.328 | 70398.774096 | clear | clear | buoys never block (E-22) | SAME |
| BL | coriolis-in | 7178.721 | 51534031.958451 | blocked | blocked | countdown.ts:86-89, mass 515483904 | SAME |
| BL | coriolis-out | 7180.721 | 51562750.841549 | clear | clear | countdown.ts:86-89 | SAME |
| ML | planet-in | 82319.000 | 6776417761 | locked | locked | torus.ts:111-119 d2 < 4r^2 | SAME |
| ML | planet-out | 82321.000 | 6776747041 | unlocked | unlocked | torus.ts:111-119 | SAME |
| ML | sun-in | 119428.054 | 14263060013.285 | locked | locked | torus.ts:123-131 d2 < 2r^2 | SAME |
| ML | sun-out | 119430.054 | 14263537729.5 | unlocked | unlocked | torus.ts:123-131 | SAME |

| Radius | Oolite | Wegolite | Relative | Verdict |
| ------ | ------ | -------- | -------- | ------- |
| planet (Lave) | 41160 | 41160 | 0 | EQUAL |
| sun (Lave) | 84449.09375 | 84449.095459 | 2.024e-08 | ROUNDING |

Blockage masses logged in Oolite equal the 261117-jji values: krait 93291.40625, buoy 698691.1875, Coriolis 515483904. Blockage radii: krait 96.5875 m, buoy 264.3277 m, Coriolis 7179.7208 m. The ENV line of the accepted run: `P0=119595,-275131,0 planetPos=0,0,452760 massLockable=true targetSystem=55:Leesti`.

## Stop-and-report events

1. **Station mass lock at exactly 25,600 m: DIFFERS.** Oolite unlocked, Wegolite locked, at d^2 = 655,360,000 (exact in float32, O-2). Cause: a `StationEntity` is a `ShipEntity` (`isShip` YES), so the strict outer gate at `PlayerEntity.m:2936` decides and the inclusive inner `<=` at `:3037` never matters for a ship. Wegolite's `torus.ts:103` uses `<=`, pinned by `tests/sim/mass-lock.test.ts:64` and `tests/sim/torus.test.ts:122`, and `ship-field.ts:18-20` calls the inclusive rule faithful (it is not). Not fixed, because it is an operator change plus two pins and two comments (W-7), not one constant. Only a distance of exactly 25,600.000 m is affected. Recorded in the FIDELITY.md Open items bullet "Station mass-lock boundary (measured in quick task 261117-lka)" and in the measurement todo. **Needs an owner decision**: change `<=` to `<` in `torus.ts:103`, flip the two pins from `true` to `false`, and correct the two comments.
2. **Buoy blockage (KNOWN, E-22).** A spawned buoy blocks at r_b - 1 m and not at r_b + 1 m (r_b = 264.33 m) in Oolite, while Wegolite never blocks on a buoy. This is the recorded owner decision of 2026-11-14 (option A); the buoy todo now carries the measurement, and the decision stays open.

No single-constant change was made. No `src/` or `tests/` file changed, so `test`, `lint` and `typecheck` were not required (MB-7), and no `src/sim/npc/**` or `src/sim/world/**` file changed, so the NPC acceptance run is not due.

## Evidence

Evidence lives under `/tmp/ooref-masslock/` and is not committed (MB-6).

- OXP: `/tmp/ooref-masslock/addons/wegolite-masslock.oxp/Config/script.js` (world script, `FULL = true` for the accepted full run, `false` for the tracer). It logs in with the two-argument `log()`. It picks the nearest system within 7 ly as the jump target while docked, launches, sets `maxSpeed = 0` until the speed is 0, then places the player at P0 (300 km from the origin along unit(planet x sun), rounded). Each trial spawns one entity at P0 + 100 km on y, moves it to the exact offset, freezes it with `oolite-nullAI.js`, speed 0 and zero velocity, and re-asserts the positions every frame. Mass-lock trials sample `player.alertMassLocked` five times over at least 0.5 s after a 1 s settle. Blockage trials call `beginHyperspaceCountdown(5)`, then set fuel 0, and read the `playerJumpFailed` reason.
- Steps file: `/tmp/ooref-masslock/masslock.steps`.
- Compare script and output: `/tmp/ooref-masslock/compare.sh`, `/tmp/ooref-masslock/compare.txt`.
- Accepted tracer run: `/tmp/ooref-masslock/run-tracer`. Accepted full run: `/tmp/ooref-masslock/run-full`. Failed first tracer run: `/tmp/ooref-masslock/failed-tracer-1`.

Accepted tracer `session.txt` and `wrapper.txt`:

```
oolite_version=1.93.1-255
appimage_sha256=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8
start_utc=2026-11-17T14:50:06Z
end_utc=2026-11-17T14:51:04Z
timeout_s=600
step 1: window ok id=4194323
step 2: sleep 10 ok
step 3: key Return ok
step 4: sleep 3 ok
step 5: key Return ok
step 6: waitlog ok
step 7: shot final ok 492414 bytes
exit=0
git_sha=42c4394
tool_tree=clean
host=opencode@192.168.178.51
image=wegolite-oolite-reference:1.93.1-255
image_id=sha256:dc38033d6928c84b49ab8bbd16302e4d66a82b97442465ec691c88f7057ab68a
steps=masslock.steps
addons=wegolite-masslock.oxp 
container_exit=0
elapsed_s=61
```

Accepted full run `session.txt` and `wrapper.txt`:

```
oolite_version=1.93.1-255
appimage_sha256=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8
start_utc=2026-11-17T14:51:16Z
end_utc=2026-11-17T14:52:57Z
timeout_s=600
step 1: window ok id=4194323
step 2: sleep 10 ok
step 3: key Return ok
step 4: sleep 3 ok
step 5: key Return ok
step 6: waitlog ok
step 7: shot final ok 407711 bytes
exit=0
git_sha=42c4394
tool_tree=clean
host=opencode@192.168.178.51
image=wegolite-oolite-reference:1.93.1-255
image_id=sha256:dc38033d6928c84b49ab8bbd16302e4d66a82b97442465ec691c88f7057ab68a
steps=masslock.steps
addons=wegolite-masslock.oxp 
container_exit=0
elapsed_s=104
```

Remote checks on the committed HEAD bb7daab (snapshot bb7daab): `tests/contract/fidelity.test.ts` 8 passed, 1 skipped; `prettier --check FIDELITY.md` clean. No `verify`, `verify-full` or `e2e` run (MB-7).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] OXP spawned the trial entity on top of the player**
- **Found during:** Task 1 (first tracer run, `/tmp/ooref-masslock/failed-tracer-1`)
- **Issue:** `system.addShips(..., P0, 0)` created each entity at the player's position, so Oolite fired `shipCollided` once per trial (`ERROR collision` lines). The measurement lines themselves were unaffected.
- **Fix:** spawn at P0 + (0, 100000, 0), then move to the exact offset. The rerun had no ERROR line.
- **Files modified:** `/tmp/ooref-masslock/addons/wegolite-masslock.oxp/Config/script.js` (outside the repository)
- **Commit:** none (not in the repository)

Otherwise the plan ran as written: no Rule 3 deviation, `--no-build` was used for every run, the JS `launch()` worked, and `maxSpeed = 0` brought the speed to exactly 0 without keyboard fallbacks.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FIDELITY.md, both todos: FOUND, changed in bb7daab.
- Commit bb7daab: FOUND (`git merge-base --is-ancestor bb7daab HEAD`).
- Tracer and full verification gates passed; no `.oxp`, `.png`, `.log`, `.steps` or `script.js` file appears in `git status` or in `git diff --name-only 42c4394 HEAD`; `src/`, `tests/`, `src/content` and `tools/oolite-ingest` unchanged since 42c4394.
