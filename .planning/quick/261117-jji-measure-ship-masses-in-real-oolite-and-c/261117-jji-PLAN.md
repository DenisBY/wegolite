---
phase: quick
plan: 261117-jji
type: execute
wave: 1
depends_on: []
files_modified:
  - FIDELITY.md
  - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
  - .planning/PROJECT.md
autonomous: true
requirements: [DATA-11]

estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "A throwaway OXP kept under /tmp (never in the repository) runs in the headless Oolite 1.93.1-255 reference and writes one MASS line per measured ship to the fetched Latest.log: the Coriolis main station, the nav buoy, the witchpoint buoy, the player Cobra Mk III and the nine NPC role ships (adder, cobramk1, gecko, krait, mamba, moray, shuttle, sidewinder, viper), 13 lines, each with dataKey, the full-precision mass and the collisionRadius, plus one SUB line per solid subentity (MS-1)."
    - "Each measured mass and collision radius is compared with the value Wegolite compiles (ships-client.json, ships-npc.json, CORIOLIS_STATION_MASS, the layout and player radius constants) and classified EQUAL (same float32 value), ROUNDING (relative difference at most 1e-6) or DIFFERS (MS-2)."
    - "FIDELITY.md records the measured values, the verdicts and the blockage radius sqrt(0.1 x mass) for each blocker, and its Open items bullet for the reference Oolite no longer says that nothing has been measured (MS-3)."
    - "No file under src/, tests/ or tools/oolite-ingest/ and no generated content changes. Any mass or NPC/player radius verdict of DIFFERS is recorded with its likely cause and reported to the owner instead of being fixed (MS-4)."
    - "Nothing Oolite-derived is committed: no OXP, no Latest.log, no screenshot (MS-5)."
    - "The measurement todo stays in pending/, marks the mass part of steps 2 and 3 done with this task's id, and keeps the mass-lock range and real-ship blockage bullet, step 4 (UI) and the Phase 16 wreck and explosion items open (MS-6)."
    - "tests/contract/fidelity.test.ts and prettier --check FIDELITY.md pass on the remote test machine against the committed HEAD (MS-7)."
  artifacts:
    - path: "FIDELITY.md"
      provides: "A Constants ledger paragraph with the measured masses, radii and verdicts from quick task 261117-jji, and an updated Open items bullet for the reference Oolite"
      contains: "261117-jji"
    - path: ".planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md"
      provides: "The mass part of steps 2 and 3 marked done; the remaining items still open"
      contains: "261117-jji"
  key_links:
    - from: "FIDELITY.md"
      to: "tools/oolite-reference/README.md"
      via: "The Open items bullet 'Reference Oolite for measurements' links the tool and now names the quick task that measured the masses"
      pattern: "261117-jji"
    - from: ".planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md"
      to: ".planning/quick/261117-jji-measure-ship-masses-in-real-oolite-and-c/261117-jji-SUMMARY.md"
      via: "The todo names quick task 261117-jji, whose SUMMARY holds the session.txt and wrapper.txt of each run"
      pattern: "261117-jji"
---

<objective>
Measure the ship masses (and collision radii) in a running Oolite and compare them with Wegolite's values. This covers the mass part of steps 2 and 3 of `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`. The wreck lifetime, the explosion and debris look, the UI comparison (step 4) and the mass-lock range and real-ship blockage bullet stay open.

Measurement scope (MS), cited where implemented:
- MS-1: one throwaway OXP under `/tmp/ooref-mass/addons/wegolite-mass.oxp/` logs `ship.mass`, `ship.collisionRadius`, `ship.dataKey` and the solid subentities for 13 ships through `tools/oolite-reference/run-remote.sh`. Labels: `coriolis`, `nav-buoy`, `witchpoint-buoy`, `player`, and the nine NPC shipdata keys `adder`, `cobramk1`, `gecko`, `krait`, `mamba`, `moray`, `shuttle`, `sidewinder`, `viper`.
- MS-2: compare against Wegolite's compiled values with a bit-exact rule (EQUAL), a float32 summation-order allowance (ROUNDING, relative at most 1e-6), and DIFFERS beyond that.
- MS-3: record the results in FIDELITY.md (Constants ledger paragraph plus Open items) and in the SUMMARY.
- MS-4: change a constant or pin only if the cause is clear and the fix is a single constant. The planner checked every measured value, and none is a lone hand-written constant (see the facts below). So any DIFFERS verdict on a mass, an NPC radius or the player radius is stop-and-report: record it with its likely cause and do not edit code, tests or content. The Coriolis and buoy layout radii are Wegolite's own collision values, not Oolite ports, so a difference there is recorded and reported only.
- MS-5: nothing Oolite-derived is committed (licence: CC BY-NC-SA output). Measured numbers may be quoted.
- MS-6: the todo stays open in `pending/`. Mark only the mass part done.
- MS-7: gate policy. No `verify`, `verify-full` or `e2e`. This plan changes documentation only, so the only repo checks are the fidelity contract test and prettier on FIDELITY.md, run remotely after the commit.

Purpose: close the condition the owner attached to ROADMAP Phase 10 criterion 2 (`criterion2-accept`, 2026-11-14): Wegolite's masses come from Oolite's algorithm run on the pinned meshes, and until now no running Oolite had confirmed them.
Output: a FIDELITY.md ledger paragraph and Open items update, an updated todo, an optional one-clause PROJECT.md Outcome update (only if every mass is EQUAL or ROUNDING), and a SUMMARY with the comparison table and the run evidence.
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
@.planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-SUMMARY.md

Reviewer and subagent brief (quoted verbatim from AGENTS.md; include it in any subagent prompt):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Task-specific additions to the brief:
- The Oolite session runs only on the remote test machine through `tools/oolite-reference/run-remote.sh`. The repo checks go through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <compose args>`, which syncs the COMMITTED HEAD, so commit first. Do NOT run `verify`, `verify-full` or `e2e` (MS-7).
- Use the codebase-memory MCP index (project `wegolite`) before grepping repo code, and prefer `rg` over `grep`.
- Oolite reference checkout: `/home/opencode/git/oolite` (tag 1.93.1-255, the same build as the image). Read Oolite behaviour there. Never fetch Oolite files over the network.
- Host-side parsing of the fetched log in `/tmp` may use `jq`, `awk` and `rg` (`/usr/bin/jq` is present). This is not a test or a build, so the Docker-only rule does not apply. Do not use host Node.
- The OXP, the steps file, the compare script, the logs and the screenshots all live under `/tmp/ooref-mass/` and never enter the repository (MS-5).

Facts verified by the planner in the Oolite checkout (cite them, do not re-derive):
- Mass is a `GLfloat` (`src/Core/Entities/Entity.h:138`), and so is the collision radius (`Entity.h:103`). The JS getters pass the float to `JS_NewNumberValue`, which widens it to a double exactly (`src/Core/Scripting/OOJSEntity.m:193-194` collisionRadius, `:213-214` mass). So `String(ship.mass)` prints the exact float32 value, and the comparison with Wegolite's float32 values can be bit-exact.
- Mass is `density x 20 x octree volume` when the ship is set up (`src/Core/Entities/ShipEntity.m:417-419`). Each solid subentity's mass is added to the parent (`ShipEntity.m:2034-2041`). Nothing else changes a live ship's mass except the wreck rescale (`:7811`) and a lost subentity (`:8193`).
- `ship.subEntities` returns only the solid (ShipEntity) subentities (`OOJSShip.m:452, 682-684` -> `EntityOOJavaScriptExtensions.m:121-124`, `shipSubEntityEnumerator`). That is the same set that `ShipEntity.m:2034-2041` adds to the mass. So hull = mass - sum of the SUB masses, approximately (a float32 running sum).
- Event order at a scenario start: the title-screen Return key, then Return on "Normal Start" -> `startScenario` (`src/Core/Entities/PlayerEntityLoadSave.m:244`) -> `loadPlayerFromFile` (`:271`) -> `setUpSpace` creates the main station (`:594`) -> `startUp` (`:640`) -> `populateNormalSpace` adds the buoys (`:643`; the populator callbacks run synchronously in `Universe.m:1658-1660`; buoys from `Resources/Scripts/oolite-populator.js:111-131`) -> `startUpComplete` (`:662`, fired by `PlayerEntity.m:2043-2046`). So `this.startUpComplete` is the first world-script event where the station, both buoys and the player ship all exist, while the player is docked. The title screen itself does not fire `startUpComplete` (`Universe.m:9458-9465`, the showDemo branch). The 261117-iuw smoke run saw `startUp` about 17 s into the session.
- Lookups: `system.mainStation` (`OOJSSystem.m:158`), `system.shipsWithPrimaryRole(role)` (`:195`), `player.ship`, `ship.dataKey` (`OOJSShip.m:355`). The nav buoy's primary role is `buoy` and the witchpoint buoy's is `buoy-witchpoint` (`oolite-populator.js:117, 131`). The standard scenario's player ship key is `cobra3-player` (`Resources/Config/scenarios.plist:2-7`). Lave (TL 5) gets a Coriolis main station, `dataKey` `coriolis-station`.
- Spawning by shipdata key: every ship key is registered as the role `[key]` (`src/Core/OOShipRegistry.m:1116`), so `system.addShips("[adder]", 1)` spawns exactly the `adder` entry. With no position argument it places the ship near the witchpoint within scanner range (`OOJSSystem.m:1324-1374`). The populator itself adds ships while the player is docked, so spawning in `startUpComplete` is safe. Mass is set during set-up, so the returned ship's mass is valid at once.
- The witchpoint buoy template uses the same model and the same solid subentity `oolite_buoy_subentity` as the nav buoy (`Resources/Config/shipdata.plist:1011` and `:1109-1116`). Equal masses are expected.
- Logging: use the two-argument `log(this.name, text)` only (README "Writing a measurement OXP"). A Latest.log line looks like `HH:MM:SS.mmm [wegolite-mass]: <text>`. The log flushes every 2 s, so the steps file must end with a `waitlog` on the final marker.

Repo facts verified by the planner (HEAD fff59c9):
- Wegolite's values. `src/content/generated/ships-client.json` is an array: `key` `coriolis-station` mass 515483904, `buoy` mass 698691.1875 (used for both buoys; `tools/oolite-ingest/convert/ship-mass.test.ts:172-173` pins `buoy` and `buoy-witchpoint` equal), `oolite_template_cobra3-player` mass 214737.6875. `src/content/generated/ships-npc.json` is an array of nine records with `key`, `mass` and `radius`. `CORIOLIS_STATION_MASS = 515_483_904` at `src/sim/hyperspace/countdown.ts:63`. Layout radii at `src/sim/world/layout.ts:71-73`: `STATION_RADIUS = 500`, `NAV_BUOY_RADIUS = 10`, `WITCHPOINT_RADIUS = 10`. The player radius is `PLAYER_COLLISION_RADIUS_M = 72.69734954833984` (`src/sim/npc/stats.ts:128`), pinned to the compiled hull table.
- Why no measured value is a single-constant fix (MS-4). Every mass is compiled content, produced by `tools/oolite-ingest/convert/ship-mass.ts` and pinned in `tools/oolite-ingest/convert/ship-mass.test.ts:114, 168-177`, `tests/content/ships-client.test.ts:61-63` and `tests/golden/content/ships-npc.json`. The one hand-written mass, `CORIOLIS_STATION_MASS`, is pinned equal to the compiled `coriolis-station` mass (`tests/sim/hyperspace-blockage.test.ts:131`). NPC radii are compiled (FIDELITY E-33, faithful). The player radius is pinned to the compiled hull row. The layout radii are hand constants, but they feed collision and docking, which are browser-facing and need `verify-full` and an owner decision. No FIDELITY row cites them as Oolite ports.
- `tests/contract/fidelity.test.ts` parses only the `## Mechanics` and `## Excerpts` sections, so a paragraph or bullets under `## Constants ledger` or `## Open items` do not touch the row contract. Do not edit Mechanics rows in this task.
- Prettier (3.9.10, default config, `proseWrap` preserve) checks FIDELITY.md. `.planning/` is in `.prettierignore`. Write the FIDELITY.md additions as prose and `-` bullets, not a markdown table: prettier would realign a table, and the fix needs a container run.
- Baselines at HEAD: FIDELITY.md contains `261117-jji` 0 times. It contains the Open-items sentence that says no value has been measured yet once (in the "Reference Oolite for measurements" bullet). The todo contains `261117-jji` 0 times. `.planning/PROJECT.md` contains the Outcome cell `✓ Phase 10 plan 10-03, owner decision 2026-11-14 |` exactly once.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer: one OXP run that logs the Coriolis station and the player Cobra Mk III</name>
  <files>/tmp/ooref-mass/addons/wegolite-mass.oxp/Config/script.js, /tmp/ooref-mass/mass.steps (both outside the repository; no repo file changes)</files>
  <precondition>`ssh opencode@192.168.178.51 true` succeeds without a password and Docker runs there; otherwise run-remote.sh exits 70, so stop and report.</precondition>
  <action>
Prove the whole path on two ships first: OXP, then the remote session, then the fetched Latest.log, then parsed numbers (MS-1).

1. Create `/tmp/ooref-mass/addons/wegolite-mass.oxp/Config/script.js`. It is a world script (README "Writing a measurement OXP"; the 261117-iuw smoke OXP at `/tmp/oolite-ref-smoke/addons/wegolite-smoke.oxp/Config/script.js` is the working shape to copy). Use `"use strict"`, with `this.name = "wegolite-mass"`, `this.author = "Wegolite"` and `this.version = "0.0.1"`. Do the work in `this.startUpComplete`, not `startUp`: the buoys do not exist before `populateNormalSpace` (see the planner facts).
2. In `startUpComplete`, inside a try/catch/finally:
   - First log `MEASURE-BEGIN system=<system.name> docked=<player.ship.docked>`.
   - Write a helper `report(label, source, ship)`. When `ship` is null or undefined, it logs `MISSING label=<label>`. Otherwise it logs one line `MASS label=<label> dataKey=<ship.dataKey> source=<source> mass=<String(ship.mass)> collisionRadius=<String(ship.collisionRadius)> subs=<n>`, where n is `ship.subEntities` length (0 when null). Then it logs one line per solid subentity: `SUB parent=<label> index=<i> dataKey=<sub.dataKey> mass=<String(sub.mass)> collisionRadius=<String(sub.collisionRadius)>`. Use `String()`, never `toFixed` or rounding. The values are exact float32 (planner facts), and the comparison is bit-exact.
   - Coriolis: when `system.mainStation.dataKey` is `coriolis-station`, report it as label `coriolis`, source `main`. Otherwise log the main station's dataKey as an `INFO` line, spawn one with `system.addShips("[coriolis-station]", 1)`, and report element 0 as label `coriolis`, source `spawned`.
   - Player: report `player.ship` as label `player`, source `player`.
   - In the catch block, log `ERROR <message>`. In the finally block, log `MEASURE-DONE`.
3. Create `/tmp/ooref-mass/mass.steps` with these lines in order: `window 120`, `sleep 10`, `key Return`, `sleep 3`, `key Return`, `waitlog 120 MEASURE-DONE`, `shot docked`. The timing follows the shipped `tools/oolite-reference/steps/docked.steps`, which passed in 261117-iuw. The `waitlog` replaces its fixed final sleep.
4. From the repository root, run `tools/oolite-reference/run-remote.sh --out /tmp/ooref-mass/run-tracer --steps /tmp/ooref-mass/mass.steps --addons /tmp/ooref-mass/addons`. Expect exit 0 in about a minute. On exit 1, read `session.txt`, `oolite-stdout.log` and `logs/Latest.log`: check that the OXP loaded (`Resource paths` lists `/addons/wegolite-mass.oxp`, and `script.load.world.listAll` names `wegolite-mass 0.0.1`) and look for script errors. Fix the OXP or the steps. Before rerunning into the same `--out`, move the failed run directory to `/tmp/ooref-mass/failed-tracer-<n>`, because `--out` must be empty or missing. Exit 64 means the output path was refused: keep it under `/tmp`. Exit 70 means sync or build failed: stop and report. Do not modify `tools/oolite-reference/` unless it has a real bug. A tool fix is a Rule 3 deviation and must be recorded in the SUMMARY.
5. Read the MASS lines. If `MEASURE-BEGIN` appears more than once, use the last block and note that in the SUMMARY.
  </action>
  <verify>
    <automated>L=/tmp/ooref-mass/run-tracer/logs/Latest.log; test -s "$L" && rg -q 'wegolite-mass 0\.0\.1' "$L" && rg -q '\]: MASS label=coriolis dataKey=coriolis-station .*mass=[0-9]' "$L" && rg -q '\]: MASS label=player dataKey=[^ ]*cobra3-player .*mass=[0-9]' "$L" && rg -q '\]: MEASURE-DONE' "$L" && S="$(git status --porcelain --untracked-files=all)" && test -z "$(printf '%s\n' "$S" | rg -i '\.(oxp|png|log|steps)$|script\.js$')"  # gates (invariant guard: Oolite artefacts in git status): Latest.log [HEAD=absent EXPECT==present]; coriolis MASS line [HEAD=absent EXPECT>=1]; player MASS line [HEAD=absent EXPECT>=1]; Oolite artefacts in git status [HEAD=0 EXPECT==0 @fff59c9 GUARD MUTATION: copying /tmp/ooref-mass/addons into the repo]</automated>
  </verify>
  <done>The fetched Latest.log of `/tmp/ooref-mass/run-tracer` shows the OXP loaded, a `MASS label=coriolis dataKey=coriolis-station` line with its SUB lines, a `MASS label=player` line with dataKey `cobra3-player`, and `MEASURE-DONE`. Nothing was added to the repository.</done>
</task>

<task type="auto">
  <name>Task 2: Expand to the buoys and the nine NPC ships, rerun, and classify every value against Wegolite</name>
  <files>/tmp/ooref-mass/addons/wegolite-mass.oxp/Config/script.js, /tmp/ooref-mass/compare.sh, /tmp/ooref-mass/compare.txt (all outside the repository; no repo file changes)</files>
  <action>
<!-- planner-discipline-allow: MISSING -->
<!-- planner-discipline-allow: ERROR -->
Add the remaining eleven ships to the OXP, take the measurement run, and compare (MS-1, MS-2, MS-4).

1. Extend `startUpComplete` in the OXP, before the finally block:
   - Nav buoy: report `system.shipsWithPrimaryRole("buoy")[0]` as label `nav-buoy`, source `found`.
   - Witchpoint buoy: report `system.shipsWithPrimaryRole("buoy-witchpoint")[0]` as label `witchpoint-buoy`, source `found`.
   - If either lookup is empty, spawn it by key with `system.addShips("[buoy]", 1)` or `system.addShips("[buoy-witchpoint]", 1)` and report it with source `spawned`.
   - For each key in the order adder, cobramk1, gecko, krait, mamba, moray, shuttle, sidewinder, viper: spawn with `system.addShips("[" + key + "]", 1)` and report element 0 with the key as the label and source `spawned`. Wrap each spawn in its own try/catch that logs `ERROR label=<key> <message>`, so one failure does not hide the rest.
2. Run `tools/oolite-reference/run-remote.sh --out /tmp/ooref-mass/run-full --steps /tmp/ooref-mass/mass.steps --addons /tmp/ooref-mass/addons`. Handle failures as in Task 1, and move a failed directory to `/tmp/ooref-mass/failed-full-<n>` before you rerun. The accepted run must have no `MISSING` or `ERROR` line.
3. Write `/tmp/ooref-mass/compare.sh` (bash with jq, awk and rg; not host Node) and run it to produce `/tmp/ooref-mass/compare.txt`.
   - Input: the last `MEASURE-BEGIN` block of `/tmp/ooref-mass/run-full/logs/Latest.log`.
   - Output: exactly one line per label, in the order coriolis, nav-buoy, witchpoint-buoy, player, then the nine NPC keys. Each line has the fields `<label> dataKey=<k> oolite_mass=<m> wegolite_mass=<m> mass_rel=<relative difference> oolite_radius=<r> wegolite_radius=<r> radius_rel=<x> radius_verdict=<V> blockage_radius_m=<sqrt(0.1 x oolite_mass), one decimal> mass_verdict=<V>`, with `mass_verdict` last.
   - Wegolite masses: `coriolis` from the ships-client.json entry `coriolis-station`, cross-checked equal to `CORIOLIS_STATION_MASS` read from `src/sim/hyperspace/countdown.ts` with the underscores stripped. Both buoys from the entry `buoy`. `player` from the entry `oolite_template_cobra3-player`. NPCs from the ships-npc.json records `mass`.
   - Wegolite radii: NPCs from ships-npc.json `radius`. `coriolis` from `STATION_RADIUS`, `nav-buoy` from `NAV_BUOY_RADIUS` and `witchpoint-buoy` from `WITCHPOINT_RADIUS` in `src/sim/world/layout.ts`. `player` from `PLAYER_COLLISION_RADIUS_M` in `src/sim/npc/stats.ts`. Read the constants from the files with rg; do not retype them.
   - Expected dataKeys: coriolis `coriolis-station`, nav-buoy `buoy`, witchpoint-buoy `buoy-witchpoint`, player `cobra3-player`, each NPC its own key. A mismatch is a measurement error, not a verdict: the script exits non-zero, and you fix the OXP and rerun.
   - Verdict rule, for mass and radius alike. Parse both decimal strings as doubles in awk. EQUAL if they are equal. ROUNDING if the absolute difference divided by the Wegolite value is at most 1e-6. DIFFERS otherwise. Print relative differences with `%.3e`. Compare against the JSON values, not the rounded numbers in the todo.
4. Interpret the result (MS-4). Record each conclusion in the SUMMARY draft notes for Task 3.
   - Mass DIFFERS on any label: stop-and-report. Do NOT edit src/, tests/, tools/oolite-ingest/ or generated content. Find the likely cause from the SUB lines. Hull = mass - sum of the SUB masses. Compare the hull and each subentity against the FIDELITY.md Constants ledger components (Coriolis: hull 228,650,880, faceplate 58,255,096, tris 220,998,576, dock 7,579,321; buoy: 691,044.375 + 7,646.7861328125). Then name the cause class: a different subentity set, a different octree volume (look for a ratio near a power of 8), a density or scale difference in shipdata, or version skew. Version skew is unlikely: none of the 14 commits between the pin and 1.93.1-255 touch ShipEntity, Octree, OOMesh or Universe.
   - NPC or player radius DIFFERS: stop-and-report the same way. These values are compiled and pinned.
   - Coriolis or buoy radius DIFFERS: expected, because the layout constants are Wegolite's own collision values. Record and report only; do not change `src/sim/world/layout.ts`.
   - ROUNDING: record it as equal within float32 summation order. Nothing changes.
  </action>
  <verify>
    <automated>L=/tmp/ooref-mass/run-full/logs/Latest.log; C=/tmp/ooref-mass/compare.txt; test -s "$L" && test "$(rg -c '\]: MASS label=' "$L")" -ge 13 && ! rg -q '\]: (MISSING|ERROR) ' "$L" && test "$(rg -c ' mass_verdict=(EQUAL|ROUNDING|DIFFERS)$' "$C")" -eq 13 && test "$(rg -c ' radius_verdict=(EQUAL|ROUNDING|DIFFERS) ' "$C")" -eq 13 && S="$(git status --porcelain --untracked-files=all)" && test -z "$(printf '%s\n' "$S" | rg -i '\.(oxp|png|log|steps)$|script\.js$')"  # gates (invariant guard: Oolite artefacts in git status): MASS lines [HEAD=absent EXPECT>=13]; failure tokens in the accepted log [HEAD=absent EXPECT==0]; compare.txt mass rows [HEAD=absent EXPECT==13]; compare.txt radius rows [HEAD=absent EXPECT==13]; Oolite artefacts in git status [HEAD=0 EXPECT==0 @fff59c9 GUARD MUTATION: copying /tmp/ooref-mass/addons into the repo]</automated>
  </verify>
  <done>`/tmp/ooref-mass/compare.txt` holds 13 classified rows covering the Coriolis station, both buoys, the player Cobra Mk III and the nine NPC ships. Each row has the Oolite and Wegolite mass and radius, the relative differences, both verdicts and the blockage radius. Every DIFFERS has a stated likely cause, and no repo file changed.</done>
</task>

<task type="auto">
  <name>Task 3: Record the results in FIDELITY.md and the todo, commit, and run the doc checks remotely</name>
  <files>FIDELITY.md, .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md, .planning/PROJECT.md (only if every mass is EQUAL or ROUNDING)</files>
  <action>
Record what was measured (MS-3, MS-6) without touching code (MS-4). Do not edit the `## Mechanics` or `## Excerpts` sections of FIDELITY.md. Write prose and `-` bullets; no markdown table (prettier). CHANGELOG.md is not touched: there is no user-visible change.

1. FIDELITY.md `## Constants ledger`. After the paragraph that starts "Tolerances and what is not reproduced", add a paragraph that starts "Measured in a running Oolite (quick task 261117-jji, 2026-11-17):". Say that:
   - The session ran on the headless Oolite 1.93.1-255 reference (`tools/oolite-reference/README.md`).
   - A throwaway OXP outside the repository logged `ship.mass` and `collisionRadius` at `startUpComplete`, after the system was populated.
   - Mass and radius are `GLfloat` in Oolite and the JS getters widen them exactly, so the comparison is bit-exact.
   Follow it with one `-` bullet per measured ship: the label and shipdata key, Oolite's mass, Wegolite's mass, the verdict, and the blockage radius (one decimal) for the Coriolis station and the buoys. Use thousands separators as the ledger does, with the exact float32 fraction. Add one bullet for the collision radii: the NPC and player radius verdicts, and the measured Coriolis and buoy radii next to the layout constants 500 and 10, with a note that the layout values are Wegolite's own and unchanged.
2. In the "Tolerances and what is not reproduced" paragraph, replace the sentence that says no Oolite runtime was available, so the Coriolis and buoy composites were derived and not observed. The new sentence says they were then observed in quick task 261117-jji (next paragraph).
3. In the "Reading of ROADMAP Phase 10 criterion 2" paragraph, append one sentence. If every mass is EQUAL or ROUNDING: the real-Oolite check ran in quick task 261117-jji on 2026-11-17 and agreed, so no constant, pin or paragraph changed. Otherwise: it disagreed for the named ships, and the change awaits the owner (see Open items).
4. `## Open items`, the "Reference Oolite for measurements" bullet: remove its two closing sentences, the one stating that nothing has been measured and the one pointing at the open comparisons. In their place, say the ship masses were measured in quick task 261117-jji (Constants ledger), and that the wreck lifetime, the explosion and debris look and the UI comparison stay open in `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`.
   - If any mass, NPC radius or player radius verdict is DIFFERS, add a new Open items bullet. It names each difference with both values and the likely cause from Task 2, and says it is reported to the owner and not changed (MS-4).
   - If the Coriolis or buoy radii differ from the layout constants, add a bullet with the measured values against `src/sim/world/layout.ts:71-73`. Say they are unchanged because they feed collision and docking, and that the buoy decision todo `.planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md` can use the measured buoy masses.
5. The todo (keep it in `pending/`; do not move it).
   - Under "Open numbers", add a line after the list stating the measured result for the Coriolis, buoy, Cobra Mk III and nine NPC masses, with a pointer to the FIDELITY.md Constants ledger and quick task 261117-jji.
   - Leave the mass-lock range and real-ship blockage bullet open.
   - Mark step 2 and step 3 "Done for the masses (quick task 261117-jji, 2026-11-17)". Say the OXP is outside the repository, and say whether any constant changed (none, per MS-4) or which differences await the owner.
   - Rewrite the "Open:" line so that it lists what remains: the mass-lock range and real-ship blockage bullet, step 4, the Phase 16 wreck lifetime and explosion items, and any reported difference.
6. `.planning/PROJECT.md`, only if every mass verdict is EQUAL or ROUNDING. In the Key Decisions row that starts "Coriolis blockage mass:", replace the Outcome cell text `✓ Phase 10 plan 10-03, owner decision 2026-11-14` with the same text followed by `; confirmed against a running Oolite 1.93.1-255 on 2026-11-17 (quick task 261117-jji)`. Change nothing else in the row. If any mass DIFFERS, leave PROJECT.md untouched.
7. Commit the changed files with `git add` on each file by name (never `git add -A`). Message: `docs(quick-261117-jji): record ship masses measured in a running Oolite`, ending with the attribution line from the session's system reminder.
8. Run the doc checks remotely against the committed HEAD:
   - `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npx vitest run tests/contract/fidelity.test.ts`
   - `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm lint npx prettier --check FIDELITY.md`
   If prettier fails, fix the markdown by hand (usually bullet or emphasis syntax), commit the fix as a separate `docs(quick-261117-jji)` commit, and rerun.
  </action>
  <verify>
    <automated>rg -q '261117-jji' FIDELITY.md && test "$(rg -c '261117-jji' FIDELITY.md)" -ge 2 && ! rg -q 'No value has been measured yet' FIDELITY.md && rg -q '261117-jji' .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md && test -f .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md && git diff --quiet fff59c9 HEAD -- src tests tools/oolite-ingest && D="$(git diff --name-only fff59c9 HEAD)" && test -z "$(printf '%s\n' "$D" | rg -i '\.(oxp|png|log)$|script\.js$')" && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npx vitest run tests/contract/fidelity.test.ts && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm lint npx prettier --check FIDELITY.md  # gates (invariants MS-4 and MS-5: no code diff, no committed Oolite artefact): FIDELITY 261117-jji [HEAD=0 EXPECT>=2]; Open-items not-measured sentence [HEAD=1 EXPECT==0]; todo 261117-jji [HEAD=0 EXPECT>=1]; changed files under src, tests, tools/oolite-ingest [HEAD=0 EXPECT==0 @fff59c9 GUARD MUTATION: editing CORIOLIS_STATION_MASS in src/sim/hyperspace/countdown.ts]; Oolite artefacts committed [HEAD=0 EXPECT==0 @fff59c9 GUARD MUTATION: committing /tmp/ooref-mass/run-full/logs/Latest.log]</automated>
  </verify>
  <done>FIDELITY.md carries the measured values, verdicts and blockage radii under the Constants ledger, and an Open items bullet that names quick task 261117-jji. Any difference is recorded as a reported Open item. The todo marks the mass part done and keeps the rest open. PROJECT.md gains the confirmation clause only when every mass matched. The fidelity contract test and prettier pass remotely on the committed HEAD.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local host -> remote test machine (ssh) | run-remote.sh syncs the tool and the /tmp add-on to the remote and fetches outputs back |
| OXP script -> Oolite in the container | our own JS runs inside Oolite, in a container with `--network none` as a non-root user, add-ons mounted read-only |
| Oolite output -> local /tmp -> repository docs | Latest.log and screenshots are Oolite output (CC BY-NC-SA); only quoted numbers may enter FIDELITY.md |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-jji-01 | Information disclosure (licence) | repository commits | high | mitigate | Every OXP, steps, log and screenshot lives under `/tmp/ooref-mass/`. run-remote.sh refuses an in-repo `--out` (exit 64). Task 1/2 verify that git status shows no `.oxp/.png/.log/.steps/script.js`. Task 3 verifies that none was committed since fff59c9 and stages files by name only. |
| T-jji-02 | Tampering (measurement integrity) | OXP labels vs spawned ships | medium | mitigate | Each MASS line carries `dataKey`, and compare.sh exits non-zero on an unexpected key. The NPCs are spawned by the exact `[key]` role (OOShipRegistry.m:1116), not by a role that could pick a variant. |
| T-jji-03 | Repudiation (reproducibility) | the reported numbers | low | mitigate | The SUMMARY records `session.txt` and `wrapper.txt` of each accepted run, the OXP's behaviour and path, and the compare.txt rows. |
| T-jji-04 | Elevation of privilege | OXP JS inside Oolite | low | accept | Our own script; the container runs with no network, as a non-root user, with only `/out` writable (261117-iuw). |
| T-jji-05 | Tampering (silent fix) | src/, tests/, generated content | medium | mitigate | MS-4: any mass or compiled-radius DIFFERS is stop-and-report. Task 3 verify requires an empty diff of `src`, `tests` and `tools/oolite-ingest` since fff59c9. |
| T-jji-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs in this plan. The only Oolite binary is the SHA256-pinned AppImage already built into the remote image (261117-iuw). |
</threat_model>

<verification>
- Task 1 and Task 2 automated checks pass on the fetched logs in `/tmp/ooref-mass/run-tracer` and `/tmp/ooref-mass/run-full`.
- `/tmp/ooref-mass/compare.txt` has 13 rows, each with both verdicts.
- Task 3 automated check passes, including the remote fidelity contract test and the prettier check on the committed HEAD.
- No `verify`, `verify-full` or `e2e` was run (MS-7).
</verification>

<success_criteria>
- All 13 ships (Coriolis main station, nav buoy, witchpoint buoy, player Cobra Mk III, nine NPC role ships) have an Oolite-measured mass and collision radius with full float precision, compared with Wegolite's values under a stated bit-exact rule.
- The results and the blockage radii are recorded in FIDELITY.md and in the SUMMARY.
- Every difference is reported with its likely cause, and no code, test or content changed (MS-4).
- The todo stays open, with the mass part marked done.
- Nothing Oolite-derived is committed.
</success_criteria>

<output>
Create `.planning/quick/261117-jji-measure-ship-masses-in-real-oolite-and-c/261117-jji-SUMMARY.md` when done. Include:
- The 13-row comparison as a table (`.planning/` is prettier-ignored), with the verdicts.
- The SUB lines for the Coriolis station and the buoys (hull and subentity masses).
- The full `session.txt` and `wrapper.txt` of the accepted tracer and full runs, as todo step 5 requires.
- The OXP's path and what it logs (not committed).
- Any rerun or Rule 3 deviation.
- A "Stop-and-report events" section that lists every DIFFERS with its likely cause, or states that there were none.
- Whether PROJECT.md was updated.
</output>
