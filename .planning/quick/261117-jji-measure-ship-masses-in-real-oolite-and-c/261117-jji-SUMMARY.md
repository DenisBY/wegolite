---
phase: quick
plan: 261117-jji
subsystem: fidelity
tags: [oolite, fidelity, mass, collision-radius, measurement]
requires:
  - 261117-iuw (headless Oolite reference)
provides:
  - Oolite-measured mass and collision radius of 13 ships, compared bit-exact with Wegolite
affects:
  - FIDELITY.md (Constants ledger paragraph and bullets, Open items)
  - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
  - .planning/PROJECT.md (one clause in the Coriolis blockage mass Outcome cell)
key-files:
  created: []
  modified:
    - FIDELITY.md
    - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
    - .planning/PROJECT.md
decisions:
  - "No constant, pin, test or generated content changed: all 13 masses and all NPC and player radii are EQUAL"
  - "Coriolis and buoy layout radii differ from Oolite's collision radii; recorded, not changed (MS-4)"
metrics:
  duration: about 10 min
  completed: 2026-11-17
status: complete
actuals:
  tokens: 1700
  tasks: 3
  commits: 1
plan_head_before: fff59c9c4930624df682a2022ba59d093deb891d
plan_head_after: ddee48b85f826cf57fcc3e479319a7258f42cef0
---

# Phase quick Plan 261117-jji: Measure ship masses in a real Oolite Summary

A throwaway OXP run in the headless Oolite 1.93.1-255 reference logged `ship.mass` and `ship.collisionRadius` of 13 ships. All 13 masses are bit-exact EQUAL to Wegolite's compiled values, and so are the nine NPC radii and the Cobra Mk III radius. Only the layout radii of the Coriolis station and the buoys differ, and those are Wegolite's own collision values.

This closes the condition the owner attached to ROADMAP Phase 10 criterion 2: the real-Oolite check agrees, so nothing in the mass work changes.

## Comparison table

Oolite and Wegolite masses are float32 values printed exactly (`String(ship.mass)`). Rule (MS-2): EQUAL = same value, ROUNDING = relative difference at most 1e-6, DIFFERS otherwise. Blockage radius = `sqrt(0.1 x oolite mass)`.

| Label | dataKey | Oolite mass | Wegolite mass | Mass verdict | Oolite radius | Wegolite radius | Radius verdict | Blockage radius (m) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coriolis | coriolis-station | 515483904 | 515483904 | EQUAL | 779.3702392578125 | 500 (`STATION_RADIUS`) | DIFFERS (layout value) | 7179.7 |
| nav-buoy | buoy | 698691.1875 | 698691.1875 | EQUAL | 59.13554763793945 | 10 (`NAV_BUOY_RADIUS`) | DIFFERS (layout value) | 264.3 |
| witchpoint-buoy | buoy-witchpoint | 698691.1875 | 698691.1875 | EQUAL | 59.13554763793945 | 10 (`WITCHPOINT_RADIUS`) | DIFFERS (layout value) | 264.3 |
| player | cobra3-player | 214737.6875 | 214737.6875 | EQUAL | 72.69734954833984 | 72.69734954833984 | EQUAL | 146.5 |
| adder | adder | 16045.4931640625 | 16045.4931640625 | EQUAL | 29.030517578125 | 29.030517578125 | EQUAL | 40.1 |
| cobramk1 | cobramk1 | 52291.8359375 | 52291.8359375 | EQUAL | 39.260494232177734 | 39.260494232177734 | EQUAL | 72.3 |
| gecko | gecko | 24669.99609375 | 24669.99609375 | EQUAL | 31.911365509033203 | 31.911365509033203 | EQUAL | 49.7 |
| krait | krait | 93291.40625 | 93291.40625 | EQUAL | 50.196590423583984 | 50.196590423583984 | EQUAL | 96.6 |
| mamba | mamba | 35806.9921875 | 35806.9921875 | EQUAL | 44.3935661315918 | 44.3935661315918 | EQUAL | 59.8 |
| moray | moray | 51203.4375 | 51203.4375 | EQUAL | 36.18608093261719 | 36.18608093261719 | EQUAL | 71.6 |
| shuttle | shuttle | 11317.5634765625 | 11317.5634765625 | EQUAL | 22.7517147064209 | 22.7517147064209 | EQUAL | 33.6 |
| sidewinder | sidewinder | 25087.62109375 | 25087.62109375 | EQUAL | 37.465919494628906 | 37.465919494628906 | EQUAL | 50.1 |
| viper | viper | 34040.6796875 | 34040.6796875 | EQUAL | 35.057655334472656 | 35.057655334472656 | EQUAL | 58.3 |

`mass_rel` is 0.000e+00 on all 13 rows. The Coriolis row also matches `CORIOLIS_STATION_MASS` (515_483_904) in `src/sim/hyperspace/countdown.ts`. Wegolite's witchpoint buoy mass is read from the `buoy` entry, as in the plan.

## Subentity (SUB) lines

Coriolis station (main station of Lave, 3 solid subentities):

- faceplate (`oolite_coriolis_faceplate`): mass 58255096, radius 702.1246337890625
- tris (`oolite_coriolis_tris`): mass 220998576, radius 702.1246337890625
- dock (`oolite_coriolis_dock`): mass 7579321, radius 279.1141662597656
- Hull = 515,483,904 - (58,255,096 + 220,998,576 + 7,579,321) is about 228,650,911, against the ledger's float32 running-sum hull 228,650,880 (the difference is float32 summation rounding, within 1e-6 relative). Subentity masses equal the FIDELITY.md ledger components exactly.

Navigation buoy and witchpoint buoy (identical, 1 solid subentity each):

- core (`oolite_buoy_subentity`): mass 7646.7861328125, radius 25.822647094726562. This equals the ledger's 7,646.7861328125, and 698,691.1875 - 7,646.7861328125 = 691,044.4013671875, within float32 rounding of the ledger hull 691,044.375.

The player and the nine NPC ships have no solid subentity (`subs=0`).

## Run evidence (outside the repository)

All under `/tmp/ooref-mass/`; none of it is committed.

- OXP: `/tmp/ooref-mass/addons/wegolite-mass.oxp/Config/script.js`. A world script (`wegolite-mass 0.0.1`) that does its work in `startUpComplete` and logs with the two-argument `log("wegolite-mass", text)`. It writes `MEASURE-BEGIN`, one `MASS label=... dataKey=... source=... mass=... collisionRadius=... subs=N` line per ship, one `SUB parent=... index=... dataKey=... mass=... collisionRadius=...` line per solid subentity, and `MEASURE-DONE`. Coriolis and the buoys were found (`source=main`, `source=found`); the player is `player.ship`; the nine NPC ships were spawned with `system.addShips("[key]", 1)`.
- Steps: `/tmp/ooref-mass/mass.steps` (`window 120`, `sleep 10`, `key Return`, `sleep 3`, `key Return`, `waitlog 120 MEASURE-DONE`, `shot docked`).
- Comparison script and output: `/tmp/ooref-mass/compare.sh`, `/tmp/ooref-mass/compare.txt` (13 rows).
- Tracer run (Coriolis and player only): `/tmp/ooref-mass/run-tracer/` (`logs/Latest.log`, `session.txt`, `wrapper.txt`, `screenshots/01-docked.png`).
- Accepted full run: `/tmp/ooref-mass/run-full/` (same layout).

`session.txt` of the accepted tracer run:

```
oolite_version=1.93.1-255
appimage_sha256=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8
start_utc=2026-11-17T13:17:28Z
end_utc=2026-11-17T13:17:50Z
timeout_s=300
step 1: window ok id=4194323
step 2: sleep 10 ok
step 3: key Return ok
step 4: sleep 3 ok
step 5: key Return ok
step 6: waitlog ok
step 7: shot docked ok 217358 bytes
exit=0
```

`wrapper.txt` of the accepted tracer run:

```
git_sha=fff59c9
tool_tree=clean
host=opencode@192.168.178.51
image=wegolite-oolite-reference:1.93.1-255
image_id=sha256:dc38033d6928c84b49ab8bbd16302e4d66a82b97442465ec691c88f7057ab68a
steps=mass.steps
addons=wegolite-mass.oxp 
container_exit=0
elapsed_s=25
```

`session.txt` of the accepted full run:

```
oolite_version=1.93.1-255
appimage_sha256=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8
start_utc=2026-11-17T13:18:01Z
end_utc=2026-11-17T13:18:22Z
timeout_s=300
step 1: window ok id=4194323
step 2: sleep 10 ok
step 3: key Return ok
step 4: sleep 3 ok
step 5: key Return ok
step 6: waitlog ok
step 7: shot docked ok 216181 bytes
exit=0
```

`wrapper.txt` of the accepted full run:

```
git_sha=fff59c9
tool_tree=clean
host=opencode@192.168.178.51
image=wegolite-oolite-reference:1.93.1-255
image_id=sha256:dc38033d6928c84b49ab8bbd16302e4d66a82b97442465ec691c88f7057ab68a
steps=mass.steps
addons=wegolite-mass.oxp 
container_exit=0
elapsed_s=24
```

Both runs logged `MEASURE-BEGIN system=Lave docked=true` exactly once and no `MISSING` or `ERROR` line. The remote image was reused (`--no-build`); `tools/oolite-reference/` was not changed.

## Commits

- `ddee48b` docs(quick-261117-jji): record ship masses measured in a running Oolite (FIDELITY.md, the todo, PROJECT.md)

## Deviations from Plan

None - plan executed exactly as written. Both runs passed first time; no rerun, no failed-run directory, no Rule 3 fix to the tool.

## Stop-and-report events

None. There is no DIFFERS on a mass, an NPC radius or the player radius. The only DIFFERS are the Coriolis and buoy layout radii, which the plan classes as record-and-report (they are Wegolite's own collision values, not Oolite ports):

- Coriolis: Oolite 779.3702392578125 m (includes the subentity extension) against `STATION_RADIUS` 500 m (`src/sim/world/layout.ts:71`).
- Buoys: Oolite 59.13554763793945 m against `NAV_BUOY_RADIUS` and `WITCHPOINT_RADIUS` 10 m (`layout.ts:72-73`).

They feed collision and docking (browser-facing, need an owner decision and `verify-full`), so they are unchanged. This is recorded in a new FIDELITY.md Open items bullet. The owner may want to decide whether to move them toward Oolite's values.

## Doc checks

On the committed HEAD `ddee48b`, run on the remote test machine:

- `vitest run tests/contract/fidelity.test.ts`: 8 passed, 1 skipped.
- `prettier --check FIDELITY.md`: all matched files use Prettier code style.
- No `verify`, `verify-full` or `e2e` was run (MS-7).
- `git diff fff59c9 HEAD` touches only FIDELITY.md, the todo and PROJECT.md. Nothing under `src/`, `tests/`, `tools/oolite-ingest/` or generated content, and no `.oxp`, `.png`, `.log` or `script.js`.

## PROJECT.md

Updated: every mass was EQUAL, so the Outcome cell of the row "Coriolis blockage mass: ..." now reads `✓ Phase 10 plan 10-03, owner decision 2026-11-14; confirmed against a running Oolite 1.93.1-255 on 2026-11-17 (quick task 261117-jji)`. Nothing else in the row changed. The row's body text still says "no Oolite runtime was available here"; that is the historical reasoning and was left as is.

## Known Stubs

None.

## Threat Flags

None. The container ran with `--network none` as a non-root user, and nothing Oolite-derived was committed (only measured numbers are quoted).

## Self-Check: PASSED

- Commit `ddee48b` is an ancestor of HEAD.
- `/tmp/ooref-mass/compare.txt` has 13 rows, each with a mass and a radius verdict.
- FIDELITY.md contains `261117-jji` and no longer says no value has been measured; the todo contains `261117-jji` and stays in `pending/`.
