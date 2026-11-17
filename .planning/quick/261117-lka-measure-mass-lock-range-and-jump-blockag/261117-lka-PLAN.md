---
phase: quick
plan: 261117-lka
type: execute
wave: 1
depends_on: []
files_modified:
  - FIDELITY.md
  - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
  - .planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md
autonomous: true
requirements: [WORLD-10, FLGT-04, NAV-04]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "A throwaway OXP kept under /tmp/ooref-masslock/ (never in the repository) runs in the headless Oolite 1.93.1-255 reference, launches the player, stops it at an empty point, and logs one ML line per mass-lock trial (13 trials) and one BL line per blockage trial (7 trials) to the fetched Latest.log, each with the exact squared centre-to-centre distance and the observed result (MB-1)."
    - "The mass-lock result is read from player.alertMassLocked, the flag Oolite's torus refusal uses, after the static scene has settled; the blockage result is the playerJumpFailed reason at countdown end, with fuel zeroed after the countdown starts so an unblocked trial fails as insufficient fuel and the player never leaves Lave (MB-2)."
    - "Every trial is compared with the verdict Wegolite's predicate gives for the same squared distance (torus.ts massLocked, ship-field.ts, countdown.ts isWitchspaceBlocked) and classified SAME, DIFFERS or KNOWN (the buoy blockage divergence E-22); the Lave planet and sun radii are compared EQUAL, ROUNDING or DIFFERS (MB-3)."
    - "Code changes only when the cause is clear and the fix is one numeric constant in src/sim with its pin; any other difference, including the predicted station boundary at exactly 25,600 m, is recorded and reported, not fixed (MB-4)."
    - "FIDELITY.md records the measured boundaries and verdicts under the Constants ledger and in Open items; the measurement todo marks the mass-lock range and real-ship blockage bullet done with 261117-lka and stays in pending/ for step 4 and the Phase 16 items; the buoy todo gets the measured buoy blockage (MB-5)."
    - "Nothing Oolite-derived is committed: no OXP, steps file, Latest.log or screenshot (MB-6)."
    - "tests/contract/fidelity.test.ts and prettier --check FIDELITY.md pass on the remote test machine against the committed HEAD; if a src/sim constant changed, test, lint and typecheck pass there too (MB-7)."
  artifacts:
    - path: "FIDELITY.md"
      provides: "A Constants ledger paragraph with the measured mass-lock and blockage boundaries and verdicts from quick task 261117-lka, and updated Open items"
      contains: "261117-lka"
    - path: ".planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md"
      provides: "The mass-lock range and real-ship blockage bullet marked done; step 4 and the Phase 16 items still open"
      contains: "261117-lka"
    - path: ".planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md"
      provides: "The measured buoy blockage boundary in a running Oolite, as evidence for the open owner decision"
      contains: "261117-lka"
  key_links:
    - from: "FIDELITY.md"
      to: "src/sim/flight/torus.ts"
      via: "The Open items bullet 'Torus mass lock, station branch (E-07)' gains the measured station boundary and names torus.ts:103"
      pattern: "261117-lka"
    - from: ".planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md"
      to: ".planning/quick/261117-lka-measure-mass-lock-range-and-jump-blockag/261117-lka-SUMMARY.md"
      via: "The todo names quick task 261117-lka, whose SUMMARY holds the session.txt and wrapper.txt of each run and the comparison table"
      pattern: "261117-lka"
---

<objective>
Measure the mass-lock range and the hyperspace jump blockage with real ships in a running Oolite, and compare each boundary with Wegolite's predicates. This closes the open bullet "Mass-lock range (strict d^2 < 25,600^2 for ships) and blockage with real ships (Phase 12)" of `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`. Step 4 (UI comparison) and the Phase 16 wreck and explosion items stay open.

Measurement scope (MB), cited where implemented:
- MB-1: one throwaway OXP, `/tmp/ooref-masslock/addons/wegolite-masslock.oxp/`, run through `tools/oolite-reference/run-remote.sh --no-build`. Thirteen mass-lock trials and seven blockage trials, listed in Task 2. Every trial places one real entity at a controlled centre-to-centre distance just inside or just outside its boundary: the krait (an NPC), a spawned Coriolis station, a spawned navigation buoy, the Lave planet and the Lave sun.
- MB-2: the observables. Mass lock comes from `player.alertMassLocked`. Blockage comes from the `playerJumpFailed` reason at countdown end. The fuel trick keeps every trial in Lave.
- MB-3: compare each trial with Wegolite's verdict for the same squared distance. Verdicts are SAME, DIFFERS, or KNOWN (only for the buoy blockage, a recorded divergence). The planet and sun radii are compared too.
- MB-4: change code only when the cause is clear and the fix is one numeric constant in `src/sim` plus its pin. Everything else is stop-and-report: record the difference with its likely cause and leave code and tests alone.
- MB-5: record the results in FIDELITY.md (Constants ledger plus Open items) and in the SUMMARY. Update the measurement todo, which stays open, and the buoy todo.
- MB-6: nothing Oolite-derived is committed (CC BY-NC-SA output). Measured numbers may be quoted.
- MB-7: gate policy. No `verify`, `verify-full` or `e2e`. Docs only: the fidelity contract test and prettier on FIDELITY.md, run remotely after the commit. If a `src/sim` constant changes: also `test`, `lint` and `typecheck` remotely.

Purpose: the Phase 12 mass-lock and blockage rules (WORLD-10, FLGT-04, NAV-04) were ported from a reading of the source. The masses were confirmed in 261117-jji, but the predicates themselves were never observed in a running Oolite.
Output: a FIDELITY.md ledger paragraph and Open items updates, an updated measurement todo, one line in the buoy todo, and a SUMMARY with the per-trial comparison table and the run evidence.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
@tools/oolite-reference/README.md
@.planning/quick/261117-jji-measure-ship-masses-in-real-oolite-and-c/261117-jji-SUMMARY.md
@src/sim/flight/torus.ts
@src/sim/hyperspace/countdown.ts
@src/sim/world/ship-field.ts

Reviewer and subagent brief (quoted verbatim from AGENTS.md; include it in any subagent prompt):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Task-specific additions to the brief:
- The Oolite session runs only on the remote test machine, through `tools/oolite-reference/run-remote.sh --no-build`. The image `wegolite-oolite-reference:1.93.1-255` is already built. Drop `--no-build` only if the tool itself has to change; such a change is a Rule 3 deviation and goes in the SUMMARY. The repo checks go through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <compose args>`, which syncs the COMMITTED HEAD, so commit first. Do NOT run `verify`, `verify-full` or `e2e` (MB-7).
- Use the codebase-memory MCP index (project `wegolite`) before grepping repo code, and prefer `rg` over `grep`.
- Oolite reference checkout: `/home/opencode/git/oolite` (tag 1.93.1-255, the same build as the image). Read Oolite behaviour there. Never fetch Oolite files over the network.
- Host-side parsing of the fetched logs in `/tmp` may use `jq`, `awk` and `rg`. This is not a test or a build, so the Docker-only rule does not apply. Do not use host Node.
- The OXP, the steps file, the compare script, the logs and the screenshots all live under `/tmp/ooref-masslock/` and never enter the repository (MB-6).

Facts verified by the planner in the Oolite checkout at 1.93.1-255 (cite them, do not re-derive):
- O-1 Mass-lock scan. `updateAlertConditionForNearbyEntities` (`src/Core/Entities/PlayerEntity.m:2893-2994`) walks `sortedEntities`. Its outer gate (`:2936`) is `zero_distance < SCANNER_MAX_RANGE2 || !isShip`. Then, only when `massLockable` (`:2941`), it calls `checkEntityForMassLock` (`:3014-3066`).
  - Stellar bodies that are not miniature (`:3019-3030`) lock when `dist < r^2 x factor` (2.0 for the sun, 4.0 for a planet) or `dist < r^2 + 50000 r + 625000000`, which is `(r + 25,000)^2`. They skip the outer gate (`!isShip`).
  - Every other entity has an inner gate `zero_distance <= SCANNER_MAX_RANGE2` (`:3037`) followed by a class switch (`:3038-3062`). PLAYER, BUOY, ROCK, CARGO, MINE and VISUAL_EFFECT never lock. NO_DRAW locks only if cloaked. THARGOID, MISSILE, STATION, POLICE, MILITARY, WORMHOLE and `default` lock.
  - A StationEntity is a ShipEntity (`isShip` YES), so for every ship, the station included, the strict outer gate decides. The inclusive inner `<=` never changes a ship's result.
  - Prediction: a station at exactly 25,600 m does NOT lock in Oolite.
- O-2 Distance precision. `zero_distance` is a `GLfloat` (`src/Core/Entities/Entity.h:100`), set in each entity's update to `HPdistance2(PLAYER->position, position)` (`Entity.m:858`). It is a centre-to-centre double, narrowed to float32.
  - `SCANNER_MAX_RANGE2` is `655360000.0` (`Entity.h:50`), and it is exactly representable in float32 (625 x 2^20).
  - With integer coordinates and an offset of exactly 25,600 m along one axis, d^2 is exactly 655,360,000, so the strict test is decided exactly.
  - Around 25,600 m the float32 step of d^2 is 64 m^2, about 0.00125 m in distance. A ±1 m trial is unaffected.
- O-3 The observable. The scan sets `ALERT_FLAG_MASS_LOCK` (`PlayerEntity.m:2976-2977`), and `massLocked` returns that flag (`:3990-3993`). The torus refusal reads it (`hyperspeed_locked = [self massLocked]`, `:2751`).
  - JS exposes it as `player.alertMassLocked` (`src/Core/Scripting/OOJSPlayer.m:110, 221-222`).
  - `player.ship.massLockable` (`OOJSPlayerShip.m:196, 505`) defaults to YES (`PlayerEntity.m:2128`).
  - Docked or docking clears the flags (`:2895-2898`).
  - Frame callbacks run after `[UNIVERSE update:]` each frame (`src/Core/GameController.m:348-355`). The player's scan may use another entity's `zero_distance` from the previous frame, so a placement needs at least a few frames before the flag is read.
- O-4 Blockage. `checkShipsInVicinityForWitchJumpExit` (`src/Core/Entities/ShipEntity.m:12498-12536`) walks every `isShip` entity except the player, whatever its scan class, so stations, buoys and NPCs all count.
  - `GLfloat k = 0.1`, and `d2` is a `GLfloat` from `HPmagnitude2(HPvector_between(...))`, centre to centre. The jump is blocked when `k * mass > d2 && d2 < SCANNER_MAX_RANGE2`; both comparisons are strict (`:12528`).
  - It is called only from `witchJumpChecklist:` (`PlayerEntity.m:6544-6560`) while the status is STATUS_WITCHSPACE_COUNTDOWN, which happens at countdown end: the countdown reaches 0 (`:3452`), then `enterWitchspace` (`:6772-6775`).
  - On a block, the status returns to IN_FLIGHT and `playerJumpFailed("blocked")` fires (`:6557`).
  - When not blocked, the checklist continues in this order: "no target" (`:6568-6579`), "too far" (`:6582-6593`), "insufficient fuel" (`:6596-6607`).
  - The real-ship scanner cap never binds: the largest blocker, the Coriolis, has a blockage radius of 7,179.7 m.
- O-5 Fuel trick. Start the countdown with a valid target and fuel, then set `player.ship.fuel = 0`. An unblocked trial then ends with `playerJumpFailed("insufficient fuel")` and the player stays in Lave; a blocked trial ends with "blocked".
  - `player.ship.beginHyperspaceCountdown(5)` (`OOJSPlayerShip.m:1457-1488`) accepts spin times of 5 to 60 s. It needs `hasHyperspaceMotor`, STATUS_IN_FLIGHT and `witchJumpChecklist:false` passing at the start, and the blockage is not checked at the start because the status is still IN_FLIGHT. It returns a boolean.
  - The 5 s spin time does not change the end-of-countdown check.
  - `ship.fuel` is writable (`OOJSShip.m:1315-1321`, light years, clamped to 0..7).
  - `player.ship.targetSystem` is writable only while docked or launching (`OOJSPlayerShip.m:913-926`), so set it in `startUpComplete`.
  - `system.info.systemsInRange(7)` lists the neighbours (`Resources/Scripts/oolite-global-prefix.js:77-80`).
- O-6 Player control.
  - `player.ship.launch()` calls `launchFromStation` (`OOJSPlayerShip.m:1003-1014`). `shipLaunchedFromStation` fires when the launch ends (`PlayerEntity.m:3535`).
  - `entity.position` is writable for any entity, the player included (`OOJSEntity.m:314-323`).
  - The player's `desiredSpeed` is read-only (`OOJSShip.m:1517-1519`), but `maxSpeed` is writable (`:1642-1651`). With `player.ship.maxSpeed = 0` the flight speed decelerates and is clamped to exactly 0 (`PlayerEntity.m:2784-2796`, `PlayerEntityControls.m:1160-1162`).
  - Keyboard fallback: hold `s` (`key_decrease_speed`, `Resources/Config/keyconfig.plist:32`; 160 m/s^2 for the Cobra Mk III). Launch fallback: `F1` on the docked screen.
- O-7 NPC freeze and spawning.
  - `ship.switchAI("oolite-nullAI.js")` attaches an AI that does nothing (`Resources/AIs/oolite-nullAI.js`). It is not valid for the player (`OOJSShip.m:1899`).
  - `ship.desiredSpeed = 0` and `ship.velocity` (writable, `:1738-1743`) stop the ship. Re-assert `ship.position` until `ship.speed` is 0.
  - `system.addShips("[key]", 1, position, radius)` spawns exactly that shipdata key (role `[key]`, `OOShipRegistry.m:1116`, the form 261117-jji used). `[coriolis-station]` spawns a CLASS_STATION StationEntity, which takes the same code path as the main station in both predicates. `[buoy]` spawns a CLASS_BUOY.
- O-8 Collision. The krait's blockage radius (96.6 m) is less than the sum of the collision radii (50.2 + 72.7 = 122.9 m), so the spheres overlap and Oolite falls through to a hull-octree test. Place the krait along `player.ship.vectorUp` with the player's orientation: the two flat hulls cannot touch at 95-98 m. The buoy (264.3 against 131.8 m) and the Coriolis (7,179.7 against 852 m) never overlap.
- O-9 Geometry. Oolite's witchpoint is the origin, and the populator lanes join the witchpoint, the planet and the sun. A point 300 km from the origin along `unit(planetPosition x sunPosition)`, rounded to integers, lies off that plane and far from every body and lane. It is P0, the test point.

Repo facts verified by the planner at HEAD 42c4394:
- W-1 `src/sim/flight/torus.ts:99-134` `massLocked`. The main station locks on `stationDistanceSquared <= SCANNER_MAX_RANGE * SCANNER_MAX_RANGE` (`:103`, inclusive). The planet locks on `d^2 < 4r^2` or `d^2 < r^2 + 2 x 25,000 r + 25,000^2` (`:111-119`), the sun on `d^2 < 2r^2` or the same surface margin (`:123-131`). Buoys never lock.
  - The station rule is pinned at exactly 25,600 m by `tests/sim/mass-lock.test.ts:64` (`[25_600, true]`) and `tests/sim/torus.test.ts:122`.
  - The comments at `torus.ts:94` and `src/sim/world/ship-field.ts:18-20` call the inclusive station rule faithful ("as they are in Oolite").
- W-2 `src/sim/world/ship-field.ts:82-100`. An NPC locks when `d^2 < scannerRange^2` (strict) and its scan class is not in `NON_LOCKING_SCAN_CLASSES` (`:41-49`). The krait is `CLASS_NEUTRAL` in `src/content/generated/ships-npc.json`, so it locks.
- W-3 `src/sim/hyperspace/countdown.ts:81-90` `isWitchspaceBlocked`: `WITCH_BLOCK_K * mass > d^2 && d^2 < scannerRange^2`, in double, both strict.
  - Blockers: the main Coriolis (`witchspaceStationMass`, `:71-73`, `CORIOLIS_STATION_MASS = 515_483_904`), and NPCs through `ship-field.ts:101-119` with the compiled masses (krait 93,291.40625). Buoys never block: owner decision 2026-11-14, option A; FIDELITY E-22; the todo `2026-11-14-make-buoys-block-hyperspace-like-oolite`.
  - The check runs at countdown completion only (`countdown.ts:13-18`), as in Oolite.
- W-4 Lave in Wegolite. The planet radius is `radiusKm x 10` = 41,160 m (`src/sim/world/layout.ts:126`, pinned at `tests/sim/layout.test.ts:63`; `radiusKm` 4116 in `src/content/generated/systems/g0.json`, id `g0-s7`). The sun radius is the compiled `sunRadius` 84,449.095459; the clamp `min(max(r, 1000), sunDistance / 2)` (`layout.ts:146-149`) is inactive because `sunDistance` 905,520 / 2 > r.
- W-5 Precision. Oolite computes `0.1f x mass` in float32 and Wegolite computes `0.1 x mass` in double. The boundary radii differ by less than 0.001 m, which a ±1 m trial cannot see. The ±1 m trials test the form of the predicate and the masses, not that rounding.
- W-6 Predicted outcomes, to be confirmed or refuted:
  - Krait at 25,599, 25,600 and 25,601 m: locked, unlocked, unlocked in both.
  - Station at 25,599, 25,600 and 25,601 m: Oolite gives locked, unlocked, unlocked; Wegolite gives locked, LOCKED, unlocked. The predicted DIFFERS is at exactly 25,600 m.
  - Buoy: never locks in both.
  - Planet at 2r ± 1 m and sun at sqrt(2) r ± 1 m: SAME if the radii are equal.
  - Blockage at r_b ± 1 m: SAME for the krait and the Coriolis. The buoy is blocked in Oolite and never in Wegolite (KNOWN).
- W-7 The predicted station difference is not a single-constant fix: it is an operator, two test pins and two comments. Under MB-4 it is stop-and-report.
- W-8 `tests/contract/fidelity.test.ts` parses only `## Mechanics` and `## Excerpts`, so prose and `-` bullets under `## Constants ledger` and `## Open items` do not touch the row contract. Do not edit Mechanics or Excerpts in this task. Prettier (default config, `proseWrap` preserve) checks FIDELITY.md; write prose and `-` bullets, not a markdown table. `.planning/` is in `.prettierignore`.
- W-9 Baselines at HEAD 42c4394: FIDELITY.md contains `261117-lka` 0 times. The measurement todo contains it 0 times; its bullet at line 31 starts `- Mass-lock range (strict d^2 < 25,600^2 for ships)`. The buoy todo contains `261117-lka` 0 times.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer: launch, stop at P0, and measure the krait's mass lock and blockage end to end</name>
  <files>/tmp/ooref-masslock/addons/wegolite-masslock.oxp/Config/script.js, /tmp/ooref-masslock/masslock.steps (both outside the repository; no repo file changes)</files>
  <precondition>`ssh opencode@192.168.178.51 docker image inspect wegolite-oolite-reference:1.93.1-255` succeeds without a password prompt; otherwise stop and report (run-remote.sh would exit 70).</precondition>
  <action>
<!-- planner-discipline-allow: ERROR -->
Prove the whole path on one NPC first: OXP, remote session, fetched Latest.log, parsed trial lines. Both observables must work (MB-1, MB-2).

1. Create `/tmp/ooref-masslock/addons/wegolite-masslock.oxp/Config/script.js` as a world script.
   - Copy the shape of `/tmp/ooref-mass/addons/wegolite-mass.oxp/Config/script.js` (261117-jji). Use `"use strict"`, `this.name = "wegolite-masslock"`, `this.author = "Wegolite"`, `this.version = "0.0.1"`.
   - Log only with the two-argument `log(this.name, text)` (README "Writing a measurement OXP").
   - Print every number with `String()`, never `toFixed`.
2. In `this.startUpComplete` (docked):
   - Log `MEASURE-BEGIN system=<system.name> docked=<player.ship.docked>`.
   - Pick the nearest system from `system.info.systemsInRange(7)` that is not the current one, and set `player.ship.targetSystem` to its ID. It is writable only while docked (O-5).
   - Start a `Timer` of about 3 s that calls `player.ship.launch()` (O-6).
3. In `this.shipLaunchedFromStation`, start the measurement driver: one `addFrameCallback` state machine that accumulates the callback's delta time. Its stages:
   - (a) Set `player.ship.maxSpeed = 0` and wait until `player.ship.speed` is exactly 0. Then set `player.ship.velocity` to the zero vector.
   - (b) Compute P0 per O-9: `system.mainPlanet.position` cross `system.sun.position`, normalised, times 300,000, each component `Math.round`ed. Set `player.ship.position = P0`.
   - (c) Wait 2 s, then log `ENV planetRadius=<system.mainPlanet.radius> sunRadius=<system.sun.radius> massLockable=<player.ship.massLockable> targetSystem=<id>:<name> P0=<x>,<y>,<z> playerSpeed=<speed>`.
   - (d) Run the trials in order. Remove each trial's entity with `ship.remove()` before the next trial.
   - If any stage throws or times out (60 s per stage), log `ERROR <stage> <message>` and continue to the end. When the trials are done, always log `MEASURE-DONE`.
4. Mass-lock trial protocol (ML).
   - Place the entity at P0 plus an exact integer offset along +x: P0 + (D, 0, 0).
   - Freeze an NPC per O-7: `switchAI("oolite-nullAI.js")`, `desiredSpeed = 0`, zero `velocity`. Re-assert its position every frame until its speed is 0.
   - Settle at least 1.0 s. Then take at least 5 samples over at least 0.5 s of `player.alertMassLocked`, `player.ship.position.squaredDistanceTo(entity.position)` and `others`. `others` is the number of ships within 30,000 m of the player other than the player and the trial entity, from `system.filteredEntities`.
   - `stable` is true only when every sample has the same flag and the same d^2, both speeds are 0 and the player position still equals P0.
   - Log exactly one line, with the fields in this order: `ML trial=<id> target=<label> dataKey=<k or none> scanClass=<c or none> nominal=<D> d2=<d2> playerSpeed=<s> targetSpeed=<s> samples=<n> locked=<true|false> stable=<true|false> others=<n>`.
   - If a trial is not stable, retry it up to twice before logging it with `stable=false`.
5. Blockage trial protocol (BL).
   - Before each trial, set `player.ship.fuel = 7`.
   - Place the entity, freeze it as in ML, and settle 1 s. Call `player.ship.beginHyperspaceCountdown(5)`. If it returns false, log `ERROR countdown-not-begun trial=<id>` and skip the trial. Otherwise set `player.ship.fuel = 0` at once (O-5).
   - In `this.playerJumpFailed(reason)`, read d^2 and `others` at that instant and log `BL trial=<id> target=<label> dataKey=<k or none> mass=<m or none> rb=<sqrt(0.1 x mass) or none> nominal=<D> d2=<d2> reason=<reason, spaces replaced by underscores> blocked=<reason === "blocked"> others=<n>`. Then set fuel back to 7.
   - Add `this.shipWillEnterWitchspace`, which logs `ERROR jumped`; it must never fire.
   - If the world script receives `shipCollided`, log `ERROR collision trial=<id>`.
6. Tracer trial list, in order:
   - `ML trial=ctrl`: no entity.
   - ML `krait-25599`, `krait-25600` and `krait-25601`: spawn with `system.addShips("[krait]", 1, P0, 0)` and set the exact position P0 + (D, 0, 0).
   - `BL trial=ctrl`: no entity.
   - BL `krait-in` and `krait-out`: D = r_b - 1 and r_b + 1 m, with r_b = `Math.sqrt(0.1 * krait.mass)`, about 96.59 m. Place the krait at `P0 + player.ship.vectorUp x D`, with its orientation set to `player.ship.orientation` (O-8).
7. Create `/tmp/ooref-masslock/masslock.steps` with these lines in order: `window 120`, `sleep 10`, `key Return`, `sleep 3`, `key Return`, `waitlog 540 MEASURE-DONE`, `shot final`. This is the 261117-jji timing with a longer wait.
8. From the repository root, run `tools/oolite-reference/run-remote.sh --no-build --timeout 600 --out /tmp/ooref-masslock/run-tracer --steps /tmp/ooref-masslock/masslock.steps --addons /tmp/ooref-masslock/addons`.
   - On exit 1 or 124, read `session.txt`, `oolite-stdout.log` and `logs/Latest.log`. Check that the OXP loaded (`Resource paths` lists `/addons/wegolite-masslock.oxp`, and `script.load.world.listAll` names `wegolite-masslock 0.0.1`), and look for script errors.
   - Fix the OXP or the steps. Before rerunning, move the failed directory to `/tmp/ooref-masslock/failed-tracer-<n>`, because `--out` must be empty or missing.
   - If the JS launch never fires `shipLaunchedFromStation`, add `sleep 8` and `key F1` before the `waitlog` (O-6). If `maxSpeed = 0` does not bring the speed to 0, add `key s s s s s s s s` after launch.
   - Exit 64: keep `--out` under `/tmp`. Exit 70: stop and report.
9. Read the lines. Expected per O-1 to O-5 and W-6: ctrl unlocked; krait locked at 25,599 and unlocked at 25,600 and 25,601; BL ctrl `reason=insufficient_fuel`; krait-in blocked; krait-out not blocked. A surprise is not a failure of this task: Task 2 records and classifies it.
  </action>
  <verify>
    <automated>L=/tmp/ooref-masslock/run-tracer/logs/Latest.log; test -s "$L" && rg -q 'wegolite-masslock 0\.0\.1' "$L" && rg -q '\]: ENV planetRadius=' "$L" && test "$(rg -c '\]: ML trial=(ctrl|krait-25599|krait-25600|krait-25601) .* locked=(true|false) stable=true others=0$' "$L")" -ge 4 && rg -q '\]: BL trial=ctrl .* reason=insufficient_fuel blocked=false others=0$' "$L" && test "$(rg -c '\]: BL trial=(krait-in|krait-out) .* blocked=(true|false) others=0$' "$L")" -ge 2 && rg -q '\]: MEASURE-DONE' "$L" && ! rg -q '\]: ERROR ' "$L" && S="$(git status --porcelain --untracked-files=all)" && test -z "$(printf '%s\n' "$S" | rg -i '\.(oxp|png|log|steps)$|script\.js$')"  # gates (invariant guard: Oolite artefacts in git status): Latest.log [HEAD=absent EXPECT==present]; stable ML lines ctrl+krait [HEAD=absent EXPECT>=4]; BL ctrl insufficient_fuel [HEAD=absent EXPECT>=1]; BL krait lines [HEAD=absent EXPECT>=2]; failure lines [HEAD=absent EXPECT==0]; Oolite artefacts in git status [HEAD=0 EXPECT==0 @42c4394 GUARD MUTATION: copying /tmp/ooref-masslock/addons into the repo]</automated>
  </verify>
  <done>The fetched Latest.log of `/tmp/ooref-masslock/run-tracer` shows the OXP loaded, an ENV line with P0, four stable ML lines (ctrl and the krait at 25,599, 25,600 and 25,601 m) with `others=0`, the BL control ending with `insufficient_fuel`, the two krait BL lines and `MEASURE-DONE`, and no failure line. Nothing was added to the repository.</done>
</task>

<task type="auto">
  <name>Task 2: Expand to the station, buoy, planet and sun, rerun, and classify every trial against Wegolite</name>
  <files>/tmp/ooref-masslock/addons/wegolite-masslock.oxp/Config/script.js, /tmp/ooref-masslock/compare.sh, /tmp/ooref-masslock/compare.txt (all outside the repository); conditionally one src/sim constant file, its pinning test and CHANGELOG.md (MB-4, only on the single-constant path)</files>
  <action>
<!-- planner-discipline-allow: ERROR -->
Add the remaining trials, take the measurement run, compare, and apply MB-4 (MB-1, MB-3, MB-4).

1. Extend the OXP's trial list to the full 20 trials, in this order. Use the protocols from Task 1.
   - ML trials:
     - `ctrl`;
     - `krait-25599`, `krait-25600`, `krait-25601`;
     - `coriolis-25599`, `coriolis-25600`, `coriolis-25601`: `system.addShips("[coriolis-station]", 1, ...)`, placed at P0 + (D, 0, 0) (O-7);
     - `buoy-1000`, `buoy-25599`: `[buoy]`.
   - BL trials:
     - `ctrl`;
     - `krait-in`, `krait-out` (along vectorUp, O-8);
     - `buoy-in`, `buoy-out`: r_b about 264.33 m, offset along +x;
     - `coriolis-in`, `coriolis-out`: r_b about 7,179.72 m, offset along +x.
     - Each target's `rb` comes from its live `mass`. Log the mass too; it must equal the 261117-jji values.
   - ML body trials last, sun last of all (it heats the ship):
     - `planet-in`, `planet-out`: the player at `system.mainPlanet.position + n x (2r -/+ 1)`. n is the unit vector of O-9, or its negative, whichever side is farther from `system.mainStation`.
     - `sun-in`, `sun-out`: the player at `system.sun.position + n x (sqrt(2) r -/+ 1)`, with the same choice of n.
     - Here r is the radius logged in ENV, and the trial entity for `others` is none.
     - The predicate is O-1's stellar branch. The surface clause `(r + 25,000)^2` is smaller than 2r and sqrt(2) r for Lave, so the factor clause is the boundary. Log the nominal distance as the actual D used.
2. Run `tools/oolite-reference/run-remote.sh --no-build --timeout 600 --out /tmp/ooref-masslock/run-full --steps /tmp/ooref-masslock/masslock.steps --addons /tmp/ooref-masslock/addons`. Handle failures as in Task 1, moving a failed directory to `/tmp/ooref-masslock/failed-full-<n>` before you rerun. The accepted run has 13 stable ML lines and 7 BL lines, all with `others=0`, and no failure line. If several `MEASURE-BEGIN` blocks appear, use the last and note it in the SUMMARY.
3. Write `/tmp/ooref-masslock/compare.sh` (bash with awk, jq and rg; no host Node) and run it to produce `/tmp/ooref-masslock/compare.txt`.
   - Input: the last block of `/tmp/ooref-masslock/run-full/logs/Latest.log`.
   - One row per trial (20 rows) with the fields `<ML|BL> <trial> d=<sqrt(d2)> oolite=<locked|unlocked|blocked|clear> wegolite=<same vocabulary> rule=<short Wegolite rule with its file:line> verdict=<V>`, with `verdict` last.
   - Then two rows: `RADIUS planet oolite=<r> wegolite=41160 rel=<%.3e> verdict=<EQUAL|ROUNDING|DIFFERS>` and `RADIUS sun oolite=<r> wegolite=<compiled sunRadius> rel=... verdict=...`.
   - Read the Wegolite inputs from the repo, never retyped: `SCANNER_MAX_RANGE` and `MASS_LOCK_SURFACE_MARGIN` from `src/sim/flight/torus.ts`; `WITCH_BLOCK_K` and `CORIOLIS_STATION_MASS` (underscores stripped) from `src/sim/hyperspace/countdown.ts`; the krait mass from `src/content/generated/ships-npc.json`; Lave's `radiusKm` (times 10) and `sunRadius` from `src/content/generated/systems/g0.json` (id `g0-s7`).
   - Wegolite's verdict is its predicate applied to Oolite's measured d^2, per W-1 to W-3:
     - the station uses `<=` (torus.ts:103);
     - the krait uses `<` and its class locks (ship-field.ts:93-94);
     - the buoy never locks and never blocks;
     - the planet uses `4r^2` or the surface margin; the sun uses `2r^2` or the surface margin;
     - blockage uses `0.1 x mass > d2 && d2 < range^2`.
     - Put a comment in the script citing each line it encodes, and check each one against the source before you run it.
   - Trial verdicts: SAME when the two results agree. KNOWN only for a buoy BL trial where Oolite blocks and Wegolite does not (E-22). DIFFERS otherwise. Radius verdicts: EQUAL for the same value, ROUNDING for a relative difference of at most 1e-6, DIFFERS above that.
4. Interpret (MB-4). Write each conclusion into the SUMMARY draft for Task 3.
   - `coriolis-25600` DIFFERS (Oolite unlocked, Wegolite locked). This is the W-6 prediction. Cause: O-1, the strict outer gate applies to stations because they are ships, while torus.ts:103 uses `<=`. Per W-7 this is stop-and-report: do NOT edit torus.ts, ship-field.ts or the tests.
   - `coriolis-25600` SAME (locked in Oolite). That refutes O-1. Record that the inclusive rule is confirmed and that the planner's reading was wrong, and change nothing.
   - Any other DIFFERS, or a radius DIFFERS. Find the cause from the logged d2 and mass.
     - If, and only if, the cause is clear and the fix is one numeric constant in `src/sim`, take the single-constant path. Candidates: `SCANNER_MAX_RANGE` and `MASS_LOCK_SURFACE_MARGIN` in torus.ts, `WITCH_BLOCK_K` and `CORIOLIS_STATION_MASS` in countdown.ts, and the `* 10` of layout.ts:126. Change the constant and the test that pins it, add a `### Fixed` entry under `## [Unreleased]` in CHANGELOG.md, and record it for Task 3.
     - Otherwise it is stop-and-report: record the cause and change nothing. That covers operators, scan-class lists, the buoy policy, structure, and generated content.
   - KNOWN buoy rows: recorded divergence E-22, an owner decision. Nothing changes.
  </action>
  <verify>
    <automated>L=/tmp/ooref-masslock/run-full/logs/Latest.log; C=/tmp/ooref-masslock/compare.txt; test -s "$L" && test "$(rg -c '\]: ML trial=[a-z0-9-]+ .* locked=(true|false) stable=true others=0$' "$L")" -ge 13 && test "$(rg -c '\]: BL trial=[a-z0-9-]+ .* blocked=(true|false) others=0$' "$L")" -ge 7 && ! rg -q '\]: ERROR ' "$L" && test "$(rg -c '^(ML|BL) .* verdict=(SAME|DIFFERS|KNOWN)$' "$C")" -eq 20 && test "$(rg -c '^RADIUS (planet|sun) .* verdict=(EQUAL|ROUNDING|DIFFERS)$' "$C")" -eq 2 && git diff --quiet 42c4394 -- src/content tools/oolite-ingest && S="$(git status --porcelain --untracked-files=all)" && test -z "$(printf '%s\n' "$S" | rg -i '\.(oxp|png|log|steps)$|script\.js$')"  # gates (invariants MB-4 generated content untouched, MB-6 no Oolite artefacts): stable ML lines [HEAD=absent EXPECT>=13]; BL lines [HEAD=absent EXPECT>=7]; failure lines [HEAD=absent EXPECT==0]; compare trial rows [HEAD=absent EXPECT==20]; compare radius rows [HEAD=absent EXPECT==2]; generated content and ingest diff [HEAD=0 EXPECT==0 @42c4394 GUARD MUTATION: regenerating ships-npc.json]; Oolite artefacts in git status [HEAD=0 EXPECT==0 @42c4394 GUARD MUTATION: copying run-full/logs into the repo]</automated>
  </verify>
  <done>`/tmp/ooref-masslock/compare.txt` holds 20 classified trial rows and 2 radius rows. Every DIFFERS has a stated cause and a decision: single-constant fix, or stop-and-report. The station boundary at exactly 25,600 m has an observed Oolite result. No generated content changed, and nothing Oolite-derived is in the working tree.</done>
</task>

<task type="auto">
  <name>Task 3: Record the results in FIDELITY.md and both todos, commit, and run the remote checks</name>
  <files>FIDELITY.md, .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md, .planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md</files>
  <action>
Record what was measured (MB-5). Do not edit the `## Mechanics` or `## Excerpts` sections of FIDELITY.md (W-8). Write prose and `-` bullets, not a markdown table. Do not touch CHANGELOG.md unless Task 2 took the single-constant path.

1. FIDELITY.md `## Constants ledger`. After the 261117-jji bullet list (the bullet that starts `- Collision radii:`), add a paragraph that starts `Mass lock and jump blockage measured in a running Oolite (quick task 261117-lka, 2026-11-17):`. It names the harness: the 1.93.1-255 reference, a throwaway OXP outside the repository, the player stopped at an empty point, entities frozen at exact centre-to-centre offsets, `player.alertMassLocked` for the lock, and the `playerJumpFailed` reason with the fuel trick for the blockage. Follow it with `-` bullets:
   - NPC mass lock (krait, CLASS_NEUTRAL) at 25,599, 25,600 and 25,601 m, with the results and verdicts. Cite `PlayerEntity.m:2936`.
   - Station mass lock at the same three distances, with the results and verdicts and the cause from Task 2.
   - Buoy: never locks, at 1,000 and 25,599 m.
   - Planet and sun at 2r ± 1 m and sqrt(2) r ± 1 m, with the measured radii next to Wegolite's 41,160 and 84,449.095459 and their verdicts.
   - Blockage for the krait, the buoy and the Coriolis at r_b ± 1 m (96.6, 264.3 and 7,179.7 m), with the results. The buoy is KNOWN (E-22). Add one sentence: the check runs at countdown end only, centre to centre, over every ship whatever its scan class (`ShipEntity.m:12498-12531`).
2. `## Open items`.
   - The bullet `**Torus mass lock, station branch (E-07).**`: append one sentence with the measured station boundary (261117-lka) and, on DIFFERS, a pointer to the new bullet.
   - On a station DIFFERS, add a new bullet that starts `**Station mass-lock boundary (measured in quick task 261117-lka).**`. It says:
     - Oolite does not lock at exactly 25,600 m, because its outer gate is strict for every ship, stations included.
     - Wegolite locks there (`src/sim/flight/torus.ts:103`, pinned by `tests/sim/mass-lock.test.ts:64` and `tests/sim/torus.test.ts:122`).
     - The comment at `src/sim/world/ship-field.ts:18-20` calls the inclusive rule faithful.
     - The fix is an operator plus two pins and two comments, not one constant, so it is reported to the owner and unchanged. Only exactly 25,600.000 m is affected.
   - Add one bullet for every other stop-and-report difference from Task 2, if any.
   - The `**Reference Oolite for measurements.**` bullet: after the 261117-jji sentence, add that the mass-lock range and the jump blockage were measured in quick task 261117-lka (Constants ledger).
3. The measurement todo (keep it in `pending/`; do not move it).
   - Mark the bullet `- Mass-lock range (strict d^2 < 25,600^2 for ships) and blockage with real ships (Phase 12).` done on the same line: append `Measured in quick task 261117-lka (2026-11-17):` and a one-sentence result, including the station finding.
   - Rewrite the `Open:` line so it lists step 4 (UI comparison), the Phase 16 wreck lifetime and explosion items, and any difference reported to the owner.
4. The buoy todo `.planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md`: add one sentence at the end of `## Problem`. It says that quick task 261117-lka observed a spawned buoy blocking a jump at r_b - 1 m and not at r_b + 1 m (r_b about 264.3 m) in Oolite 1.93.1-255, if the run showed that; otherwise state what it did show. The owner decision itself stays open.
5. Commit the changed files with `git add` on each file by name (never `git add -A`), plus the Task 2 constant files if that path was taken. Message: `docs(quick-261117-lka): record mass lock and jump blockage measured in a running Oolite`. Use `fix(quick-261117-lka): ...` instead if a constant changed. End the message with the attribution line from the session's system reminder.
6. Run the checks remotely against the committed HEAD:
   - `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npx vitest run tests/contract/fidelity.test.ts`
   - `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm lint npx prettier --check FIDELITY.md`
   - If src or tests changed (the single-constant path): also `run --rm test`, `run --rm lint` and `run --rm typecheck` through the same wrapper (MB-7). Do not run the NPC acceptance run: no file under `src/sim/npc/**` or `src/sim/world/**` changes on any allowed path, unless the constant was in layout.ts. In that case, record in the SUMMARY that the owner should rerun it on the remote machine (AGENTS.md).
   - If prettier fails, fix the markdown by hand, commit the fix as a separate `docs(quick-261117-lka)` commit, and rerun.
  </action>
  <verify>
    <automated>T=.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md; B=.planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md; R=/home/opencode/.claude/scripts/wegolite-remote-run.sh; test "$(rg -c '261117-lka' FIDELITY.md)" -ge 2 && test -f "$T" && rg -q 'Mass-lock range \(strict.*261117-lka' "$T" && rg -q '261117-lka' "$B" && git diff --quiet 42c4394 HEAD -- src/content tools/oolite-ingest && D="$(git diff --name-only 42c4394 HEAD)" && test -z "$(printf '%s\n' "$D" | rg -i '\.(oxp|png|log|steps)$|script\.js$')" && "$R" run --rm test npx vitest run tests/contract/fidelity.test.ts && "$R" run --rm lint npx prettier --check FIDELITY.md && { git diff --quiet 42c4394 HEAD -- src tests || { "$R" run --rm test && "$R" run --rm lint && "$R" run --rm typecheck; }; }  # gates (invariants MB-4 and MB-6): FIDELITY 261117-lka [HEAD=0 EXPECT>=2]; todo bullet marked with 261117-lka [HEAD=0 EXPECT>=1]; todo still in pending [HEAD=present EXPECT==present @42c4394 GUARD MUTATION: moving the todo to .planning/todos/completed/]; buoy todo 261117-lka [HEAD=0 EXPECT>=1]; generated content and ingest diff [HEAD=0 EXPECT==0 @42c4394 GUARD MUTATION: editing src/content/generated/ships-npc.json]; Oolite artefacts committed [HEAD=0 EXPECT==0 @42c4394 GUARD MUTATION: committing /tmp/ooref-masslock/run-full/logs/Latest.log]</automated>
  </verify>
  <done>FIDELITY.md carries the measured mass-lock and blockage boundaries and verdicts under the Constants ledger, and the Open items name 261117-lka. A station boundary difference, if measured, is a reported Open item with no code change. The measurement todo marks the bullet done and stays open for step 4 and the Phase 16 items. The buoy todo carries the measured buoy blockage. The fidelity contract test and prettier pass remotely on the committed HEAD, plus test, lint and typecheck if a constant changed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local host -> remote test machine (ssh) | run-remote.sh syncs the tool and the /tmp add-on to the remote and fetches outputs back |
| OXP script -> Oolite in the container | our own JS runs inside Oolite, in a container with `--network none` as a non-root user, add-ons mounted read-only |
| Oolite output -> local /tmp -> repository docs | Latest.log and screenshots are Oolite output (CC BY-NC-SA); only quoted numbers may enter FIDELITY.md and the todos |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-lka-01 | Information disclosure (licence) | repository commits | high | mitigate | Every OXP, steps file, log and screenshot lives under `/tmp/ooref-masslock/`. run-remote.sh refuses an in-repo `--out` (exit 64). Tasks 1 and 2 verify that git status shows no `.oxp/.png/.log/.steps/script.js`. Task 3 verifies that none was committed since 42c4394 and stages files by name only. |
| T-lka-02 | Tampering (measurement integrity) | trial geometry | medium | mitigate | Each trial logs the exact d^2 read at the moment of the result, both speeds, and `others`, the count of other ships within 30 km. A trial counts only when `stable=true` and `others=0`. A control trial in each family proves the empty point does not lock or block on its own. |
| T-lka-03 | Tampering (measurement integrity) | the jump itself | medium | mitigate | The fuel trick keeps the player in Lave: an unblocked trial must end in `insufficient_fuel`, and `shipWillEnterWitchspace` logs a failure line, which the verify rejects. |
| T-lka-04 | Repudiation (reproducibility) | the reported verdicts | low | mitigate | The SUMMARY records `session.txt` and `wrapper.txt` of each accepted run, the OXP's behaviour and path, every compare.txt row, and the source lines each Wegolite rule encodes. |
| T-lka-05 | Tampering (silent fix) | src/sim predicates and their pins | medium | mitigate | MB-4: only a clear single-constant fix may change code, and it then runs test, lint and typecheck remotely. The predicted station difference is stop-and-report (W-7). Task 2 and Task 3 verify that generated content and the ingest tool are unchanged. |
| T-lka-06 | Elevation of privilege | OXP JS inside Oolite | low | accept | Our own script; the container runs with no network, as a non-root user, with only `/out` writable (261117-iuw). |
| T-lka-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs in this plan. The only Oolite binary is the SHA256-pinned AppImage already built into the remote image (261117-iuw); `--no-build` reuses it. |
</threat_model>

<verification>
- The Task 1 and Task 2 automated checks pass on the fetched logs in `/tmp/ooref-masslock/run-tracer` and `/tmp/ooref-masslock/run-full`.
- `/tmp/ooref-masslock/compare.txt` has 20 trial rows and 2 radius rows, each with a verdict.
- The Task 3 automated check passes, including the remote fidelity contract test and the prettier check on the committed HEAD, plus test, lint and typecheck if a constant changed.
- No `verify`, `verify-full` or `e2e` was run (MB-7).
</verification>

<success_criteria>
- Oolite's mass-lock boundary is observed for an NPC ship, a station, a buoy, the planet and the sun. Its blockage boundary is observed for an NPC, a buoy and a Coriolis. Every trial is just inside or just outside its boundary, with the exact squared distance logged.
- Every boundary is compared with Wegolite's predicate, and every difference is classified with its likely cause.
- Code changed only if a difference had a clear single-constant fix. Otherwise it is reported, including the predicted station boundary at exactly 25,600 m.
- FIDELITY.md, the measurement todo (still open) and the buoy todo record the results, and nothing Oolite-derived is committed.
</success_criteria>

<output>
Create `.planning/quick/261117-lka-measure-mass-lock-range-and-jump-blockag/261117-lka-SUMMARY.md` when done. Include:
- The exact predicates of both codebases as read (Oolite file:line, Wegolite file:line), and whether the measurement confirmed the planner's readings O-1 to O-5.
- The 20-row trial comparison and the 2 radius rows as tables (`.planning/` is prettier-ignored), with the Oolite d, both results and the verdict.
- The full `session.txt` and `wrapper.txt` of the accepted tracer and full runs.
- The OXP's path and what it does (not committed), with any rerun or Rule 3 deviation.
- A "Stop-and-report events" section that lists every DIFFERS with its likely cause and why it was not fixed, or the single-constant change that was made and its remote gate results.
</output>
