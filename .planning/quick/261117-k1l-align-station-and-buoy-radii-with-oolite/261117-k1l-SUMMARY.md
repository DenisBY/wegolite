---
phase: quick
plan: 261117-k1l
subsystem: content-build, sim/world, acceptance-harness
status: complete
tags: [fidelity, collision-radius, station, buoy, acceptance, owner-decision]
requires: [quick-261117-jji measured radii]
provides: [compiled collisionRadius in ships-client.json, layout radii equal to Oolite's]
affects: [NPC proximity and avoidance, STATION_AEGIS placement, witchpoint arrival, torus factor, scanner rim, acceptance harness]
tech-stack:
  added: []
  patterns: [compiled value plus pinned sim literal (as CORIOLIS_STATION_MASS)]
key-files:
  created: []
  modified:
    - tools/oolite-ingest/convert/ship-radius.ts
    - tools/oolite-ingest/convert/ship-radius.test.ts
    - tools/oolite-ingest/convert/ships.ts
    - tools/oolite-ingest/generate.ts
    - src/content/schemas/ship.ts
    - src/content/generated/ships-client.json
    - src/content/generated/manifest.json
    - src/sim/world/layout.ts
    - src/sim/ai/test-spawn.ts
    - tests/sim/layout.test.ts
    - tests/content/ships-client.test.ts
    - tests/render/station.test.ts
    - tests/sim/npc/proximity.test.ts
    - tests/sim/npc/flyers.scenario.test.ts
    - tests/sim/ai/test-spawn.test.ts
    - tests/sim/torus.test.ts
    - tests/acceptance/thresholds.ts
    - tests/acceptance/detectors.test.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
    - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
decisions:
  - "Station and buoy collision radii follow Oolite: 779.3702392578125 m and 59.13554763793945 m, compiled from the meshes by the ported subentity term (ShipEntity.m:2028-2044) and pinned as layout literals"
  - "Owner Q-1 option (A): STATION_RADIUS_M restated, station flyer goal 2,500 -> 3,500 m, detectors.test.ts station-sphere case rescaled, one trailer commit"
metrics:
  duration: "about 25 min"
  completed: 2026-11-17
estimate:
  tokens: 110000
  tasks: 3
actuals:
  tokens: 72650
  tasks: 3
  commits: 1
plan_head_before: dc57dcf2e2a1b813a027ab3bab980311eea7a730
plan_head_after: 52d11ad12397f0c83f0d4b8b93b5a8f6c4d2f2f5
---

# Quick 261117-k1l: Align the station and buoy collision radii with Oolite Summary

The content build now computes Oolite's collision radius with the solid-subentity term (ShipEntity.m:2028-2044) and writes `collisionRadius` into ships-client.json: Coriolis 779.3702392578125, buoy 59.13554763793945 and Cobra Mk III 72.69734954833984. All three equal the 261117-jji measurement bit for bit. The layout now uses those values. The owner-approved Q-1 option (A) harness change is in the same commit. Remote `verify` and the 20-seed acceptance run are both green.

## Q-1 answer

The owner chose option (A) on 2026-11-17:
- raise the station flyer goal to 3,500 m (`STATION_SCRIPT_RANGE_M`, `FLYER_SCRIPT_RANGES.station`);
- rescale the station-sphere case of `detectors.test.ts`;
- set `STATION_RADIUS_M` to the compiled station radius;
- put all of it in one commit with the owner's trailer.

Owner rationale: in Oolite, a ship that is not docking and flies straight at the station at full speed is also alerted at about 3.1 km (ShipEntity.m:6119-6131, the 4x forward stretch). Real traffic gets closer only through `dockingInstructions` (ShipEntity.m:6112), and Wegolite has no NPC docking. So 3,500 m follows Oolite's behaviour. It is not a loosening to fit the code.

## Design: compiled value plus pinned literal (not the literal fallback)

- `collisionRadius` / `computeCollisionRadii` in `tools/oolite-ingest/convert/ship-radius.ts` follow Oolite's rule:
  - start from the float32 hull radius;
  - skip flashers;
  - for each solid subentity, compute `Math.sqrt(x*x+y*y+z*z) + sub hull radius` in doubles;
  - when the sum is strictly greater than the current radius, store `Math.fround(sum)`, because `collision_radius` is a GLfloat.
- The build fails with a SCHEMA error when a solid subentity has no key or no position, or has a solid subentity of its own (the nested term is not ported).
- `computeShipRadii`, the NPC path, is unchanged. It still refuses a solid subentity. The shared entry, model and mesh lookup moved into a helper, `resolveHull`, with identical error messages.
- `generate.ts` passes `computeCollisionRadii(CLIENT_SHIP_KEYS, ...)` to `emitClientShips(catalogue, masses, radii)`. That function writes `collisionRadius` beside `mass` and throws `no computed collision radius for "<key>"` when a radius is missing. The schema gained `collisionRadius: z.number().positive().optional()` after `mass`; line 97, which FIDELITY.md cites, still holds `mass`.
- `src/sim` may not import the catalogue (ESLint), so `src/sim/world/layout.ts:70-73` holds the literals.
  - The edit kept the line count: still 202 lines, and the cited lines 71, 126-131 and 139 did not move.
  - `tests/sim/layout.test.ts` reads ships-client.json and pins `station.radius`, `navBuoy.radius` and `witchpoint.radius` to the compiled `collisionRadius` and to the measured values.
  - This is the `CORIOLIS_STATION_MASS` pattern: the number is compiled, and the literal cannot drift from it.
- Values:
  - Coriolis 779.3702392578125 = fround(500.2561 + 279.1141662597656). The dock term is the largest: the hull alone is 702.1246337890625, and the faceplate and tris at the origin are 702.12 each.
  - Both buoys 59.13554763793945. This is the hull value; the core subentity (25.8226470947265625 m at the origin) lies inside it.
  - Cobra Mk III 72.69734954833984 (no subentities). It equals `PLAYER_COLLISION_RADIUS_M`.

## Generated-file diff

`docker compose run --rm assets` changed only two files:
- `src/content/generated/ships-client.json`: three added `"collisionRadius"` lines;
- `src/content/generated/manifest.json`: the ships-client row's bytes 19518 -> 19644 and its sha256.

`assets:check` reports no differences locally and in the remote verify.

## Re-pinned tests and goldens, each with its consumer

| File | Change | Consumer |
|------|--------|----------|
| `tests/sim/layout.test.ts` | buoy radii 10 -> 59.13554763793945; a new case ties them to ships-client.json and the 261117-jji values | the layout itself |
| `tests/content/ships-client.test.ts` | excludes `collisionRadius` in the unchanged-copy case; pins the three radii; checks that ships.json has no radius; adds the missing-radius emitter case | content build |
| `tools/oolite-ingest/convert/ship-radius.test.ts` | 10 new cases: the measured values, both buoys, the dock growth, the subentity hull radii, an independent `Float32Array` recomputation of the dock term, the far-out flasher, the far-out solid subentity, and three SCHEMA failures | content build |
| `tests/render/station.test.ts` | `layout.station.radius` 500 -> 779.3702392578125; the hull half-extent stays 500 m | scanner rim / render statics |
| `tests/sim/npc/proximity.test.ts` case (c) | radius pinned; start `4 r + 900` (about 4,017.48 m); closed form `< 4 r`; prefilter comment about 1,629 m per axis | NPC pair trigger 4 x r (2,000 -> 3,117.48 m), avoidance range 10 x r (5,000 -> 7,793.70 m) |
| `tests/sim/npc/flyers.scenario.test.ts` | header "cover 1,500 m"; `minStationDistance > layout.station.radius` | station flyer goal 3,500 m |
| `tests/sim/ai/test-spawn.test.ts` | `FLYER_SCRIPT_RANGES` pin `station: 3_500` and the spawned station flyer's `range: 3_500` | flight-script station range |
| `tests/sim/torus.test.ts` | engaged factor 34.5688 -> 34.528340498891950 and the 400 km factor 63.2060 -> 63.183908533798550, both closed forms `32 x sqrt((d - 779.37) / 102,400)` | torus nearest-surface distance (the station is the nearest surface) |
| `tests/acceptance/thresholds.ts` (frozen) | `STATION_RADIUS_M` 779.3702392578125, `STATION_SCRIPT_RANGE_M` 3_500, the prose that restates them, and a module-comment note on the second commit | acceptance harness |
| `src/sim/ai/test-spawn.ts` (frozen) | `FLYER_SCRIPT_RANGES.station` 3_500 | acceptance harness and test hook |
| `tests/acceptance/detectors.test.ts` (frozen) | station-sphere case rescaled (9,100 / 9,221 / 9,222 / 9,220.6297607421875; min clearance -1.3702392578125); clean-control station metric rate 0.5 -> 0.4 (see deviations) | acceptance harness |

Goldens: none moved.
- `tests/golden/world/inert-lave-epoch1.json`: the STATION_AEGIS ships of epoch 1 sit 42-48 km from the station, so no draw falls in the 600-935.24 m band, and the populate test still rebuilds the identical section and hash. The writer was not run.
- `flight-hash-pins.json`: unchanged, as expected (the recorded flights engage neither the torus nor the arrival safety).

The oracle fixtures that carry a 500 m station (`tests/oracles/npc/**`) are untouched. So are `detectors.ts`, `npc-flight.acceptance.ts`, `flight-script.ts` and `accepted-crossings.ts`.

## Commit

- `52d11ad` feat(quick-261117-k1l): align the station and buoy collision radii with Oolite. This one commit holds Tasks 1-3, with the trailer block:
  - `Detector-change-approved-by-owner: 2026-11-17 station radius aligned with Oolite's measured collisionRadius (779.37 m, quick 261117-jji); station flyer goal 2500 -> 3500 m because Oolite's proximity alert (ShipEntity.m:6119-6131, 4x forward stretch at full speed, no docking exemption without NPC docking) fires at ~3117 m`
  - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Exactly one commit since dc57dcf touches thresholds.ts, detectors.test.ts or test-spawn.ts.

## Gate results

| Gate | Where | Result |
|------|-------|--------|
| `assets` + `assets:check` | local Docker | wrote 121 files; no differences |
| targeted Task 1 tests (3 files, 44 tests) | local Docker | pass |
| targeted Task 2 tests (13 files) | local Docker | pass after the deviations below |
| `test:fast`, full unit suite | local Docker, 2 min 3 s | 2 torus failures, fixed (deviation 3), then green |
| `tests/contract/fidelity.test.ts` with `OOLITE_SRC` (pinned 7437f22 tree) | local Docker | 9/9 pass, verbatim excerpt check included |
| `typecheck` | local Docker, 13.5 s | pass |
| `verify` (lint, typecheck, assets:check, unit + coverage, build, e2e smoke) | remote, snapshot 52d11ad | **exit 0, 151 s**; 218 files / 5,607 tests passed, 10 skipped; e2e smoke 27 passed |
| `npm run test:acceptance` (20 seeds) | remote, snapshot 52d11ad | **exit 0, 79 s**; 21 of 21 cases passed in 74.5 s |

## 20-seed acceptance result (AGENTS.md rule)

- Cases: 21 of 21 passed (20 epochs plus the run-minimum case), runtime 74.5 s (about 3.7 s per epoch).
- Every failure counter is 0 on all 20 seeds: stuck, frozen, frustration, station-sphere entries, hull-crossing episodes and unexcused crossings, repairs, AI faults, AI drops, hashWorld failures.
- Run minimums:

  | Minimum | This run | Phase 14 baseline |
  |---------|----------|-------------------|
  | station / intercept / flee arrivals | 40 / 40 / 40 | same |
  | AVOID_COLLISION entries | 23 | same |
  | attack ticks near the player | 61,662 | same |
  | stuck windows evaluated | 175 | same |
  | frozen windows evaluated | 293 | 294 |

- Minimum station-sphere clearance: 2,713.00 m (epoch 3). Measured against the new 779.37 m sphere, this is a closest centre distance of about 3,492 m, just inside the 3,500 m goal. The baseline was 1,994.67 m against 500 m, a centre distance of about 2,495 m.
- Minimum hull clearance: 41.41 m (epoch 10), unchanged from the baseline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A second literal 2,500 pin in test-spawn.test.ts**
- Found during: Task 2
- Issue: `tests/sim/ai/test-spawn.test.ts:422` pins the spawned station flyer's `range: 2_500`. The plan did not list it.
- Fix: changed it to `3_500`, which follows `FLYER_SCRIPT_RANGES.station`. The file is not frozen.
- Commit: 52d11ad

**2. [Rule 3 - Blocking] Frozen `detectors.test.ts` clean control depended on the old 2,500 m goal**
- Found during: Task 2
- Issue: "the clean control" feeds the station flyer a synthetic goal metric `12_000 - 0.5 k` over 18,000 ticks, which ends at 3,000 m. With the 3,500 m goal it is met in the fifth window, so `stuckWindowsEvaluated` became 9, not 10. The cause is the approved range raise itself.
- Fix: changed the synthetic rate to `12_000 - 0.4 * k`, which ends at 4,800 m, so the goal stays unmet in all five windows, as the control intends. The expected counts (10 stuck and 10 frozen windows, no breach) are unchanged. No detector, threshold or definition changed. The fix is in the trailer commit and is recorded in the PROJECT.md row.
- **Owner attention:** the owner's approval named only the station-sphere case of this frozen file. This is a second, input-only edit in that file. It is needed for the same reason, but I made it without separate approval. Please confirm or revert it.
- Commit: 52d11ad

**3. [Rule 1 - Consumer pin] tests/sim/torus.test.ts researched factors**
- Found during: the full unit run
- Issue: the torus factor at the 120 km and 400 km test points uses the station as the nearest surface, so it moves with the radius. The file was not in the plan's list.
- Fix: re-pinned both values to closed forms with the new radius (34.528340498891950, 63.183908533798550). Added to the PROJECT.md row.
- Commit: 52d11ad

**4. [Rule 1] FIDELITY row needed its excerpt-id cell**
- The table has 5 columns. The new row carries `E-89`, so the contract test passes.

**5. ESLint `no-loss-of-precision`**
- The literal `25.822647094726562` (the SUB value as 261117-jji printed it) is written as the exact float32 decimal `25.8226470947265625`. It is the same double.

**6. Trailer wording**
- Per the executor prompt, the owner's own trailer text is used verbatim. It cites "quick 261117-jji", not "261117-k1l".
- Consequence: the plan's Task 3 gate `rg '^2026-11-17 .*261117-k1l'` on the trailer value does not match. The trailer is present, dated 2026-11-17, and the commit subject carries `quick-261117-k1l`.

**7. PROJECT.md row 267 note**
- The plan's text said the change "re-pinned tests/golden/world/inert-lave-epoch1.json". The golden did not move, so the note states that instead.

**8. thresholds.ts module comment**
- The second-commit note adds 5 lines above line 92. No live document cites line numbers of thresholds.ts (checked with rg), so nothing broke. The thresholds.ts self-citations of `layout.ts:126-131` and `:71` still hold.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file-access surface. The frozen-harness edits are listed above (T-k1l-01), and the oracle and frozen files outside option (A) are byte-identical.

## Self-Check: PASSED

- 52d11ad exists on HEAD.
- `"collisionRadius": 779.3702392578125` is in ships-client.json.
- `STATION_RADIUS_M = 779.3702392578125;` is in thresholds.ts.
- `### E-89 src/Core/Entities/ShipEntity.m:2033-2041` is in FIDELITY.md.
- PROJECT.md has 5 mentions of 261117-k1l.
- The todo mentions 261117-k1l.
- The phrase "feed collision and docking" no longer appears in FIDELITY.md.
- layout.ts has 202 lines.
