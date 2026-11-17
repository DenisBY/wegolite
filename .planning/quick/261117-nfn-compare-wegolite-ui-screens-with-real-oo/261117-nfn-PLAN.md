---
phase: quick
plan: 261117-nfn
type: execute
wave: 1
depends_on: []
files_modified:
  - FIDELITY.md
  - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
  - .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
  - .planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md
  - .planning/todos/pending/2026-11-17-ui-chart-differences-from-oolite.md
autonomous: true
requirements: [FLGT-05, ECON-04, ECON-06, ECON-07, NAV-01]

estimate:
  tokens: 85000
  raw_tokens: 85000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "One scripted headless Oolite 1.93.1-255 session (new Jameson at Lave, 1280x720) yields the F5 status, F8 market, F7 system data, short-range chart, galactic chart, in-flight forward view and 'Hyperspeed mass-locked.' message screenshots, fetched to /tmp/ooref-ui/oolite/ (UI-1)."
    - "One scratch Playwright spec run on the remote test machine against the committed HEAD yields the same screens from Wegolite at 1280x720 under the same conditions (new game at Lave, F7 replaced by the chart hover card for Lave, a recorded removal), fetched to /tmp/ooref-ui/wegolite/; the spec never enters the repository (UI-2)."
    - "Both in-flight shots are taken with the ship stopped just after the launch, with no NPC traffic (Oolite: the OXP removes it; Wegolite: the browser-test bundle has traffic off), and both message shots follow a J press while mass-locked by the station (UI-3)."
    - "/tmp/ooref-ui/compare.html shows every pair side by side with per-pair notes and a ranked difference list; it is never committed or published (UI-4)."
    - "Every difference is classified R1 information, R2 layout, R3 style, D decided (citing its PROJECT.md Key Decisions row or commit) or N noise (noted once); every R1 and R2 difference, and every R3 difference that matters for fidelity, is a bullet in a pending todo (UI-5)."
    - "FIDELITY.md Open items and the SUMMARY carry the ranked list; the measurement todo marks step 4 done with 261117-nfn and stays in pending/ for the Phase 16 items (UI-6)."
    - "No file under src/, tests/, tools/ or index.html changes; tests/contract/fidelity.test.ts and prettier --check FIDELITY.md pass on the remote machine against the committed HEAD (UI-7)."
  artifacts:
    - path: "FIDELITY.md"
      provides: "An Open items bullet with the ranked UI differences from quick task 261117-nfn, and the Reference Oolite bullet no longer listing the UI comparison as open"
      contains: "261117-nfn"
    - path: ".planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md"
      provides: "Step 4 marked done with 261117-nfn; the Open line lists only the Phase 16 items"
      contains: "261117-nfn"
  key_links:
    - from: "FIDELITY.md"
      to: ".planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md"
      via: "The Open items bullet names quick task 261117-nfn and each todo file that carries a difference worth fixing"
      pattern: "261117-nfn"
    - from: ".planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md"
      to: ".planning/quick/261117-nfn-compare-wegolite-ui-screens-with-real-oo/261117-nfn-SUMMARY.md"
      via: "Step 4 names quick task 261117-nfn, whose SUMMARY holds the ranked list and the session.txt and wrapper.txt of each Oolite run"
      pattern: "261117-nfn"
---

<objective>
Compare Wegolite's UI screens with a running Oolite and report the real differences. This is step 4 of `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md` ("screenshots of the scanner, HUD and messages from the xvfb display next to Wegolite's"). The deliverable is the comparison and a ranked difference list, not fixes.

Purpose: the UI has never been checked against the real game. A matched set of screenshots, taken under the same conditions in both games, turns "looks about right" into a list of concrete differences the owner can schedule.

Output: Oolite and Wegolite screenshots and a local side-by-side page under `/tmp/ooref-ui/` (never committed, never published), the ranked list in the SUMMARY and in the FIDELITY.md Open items, pending todos for the differences worth fixing, and the measurement todo updated.

Scope (UI), cited where implemented:
- UI-1: Oolite capture. One throwaway OXP plus one steps file under `/tmp/ooref-ui/`, run through `tools/oolite-reference/run-remote.sh --no-build`. Oolite's window is already 1280x720 (`Requested a new surface of 1280 x 720` in the 261117-lka `Latest.log`). Keys from `/home/opencode/git/oolite/Resources/Config/keyconfig2.plist`: F5 status, F6 chart (a second F6 toggles to the galactic chart), F7 system data, F8 market, F1 launch (`key_launch_ship`, honoured from the status screen per `src/Core/Entities/PlayerEntityControls.m:4166`), `j` torus (refused while mass-locked with `jump-mass-locked`, "Hyperspeed mass-locked.", shown for 1.5 s, `PlayerEntityControls.m:1166-1175`).
- UI-2: Wegolite capture. A scratch Playwright spec under `/tmp/ooref-ui/wego-src/`, copied to the remote and mounted into the e2e container (AGENTS.md: scratch under `/tmp`, mounted with `-v /tmp/<dir>:/scratch`). Inside the container it is copied into the remote synced tree's `tests/e2e/`, because `playwright.config.ts` sets `testDir: "./tests/e2e"` and the spec imports `./helpers/*`. The remote tree `~/wegolite-remote` is wiped by every wrapper run, and nothing touches the local repository. Keys from `src/input/actions.ts:168-236`: F5 status, F8 market, F6 chart, Tab chart preset (local to galaxy), Escape chart back, KeyJ torus. Wegolite has no F7 screen: commit c1c9897 removed it ("The F6 hover card already shows the same system fields and description"). The Lave hover card on the chart is the comparison target for Oolite's F7, and the SUMMARY says so. Every other requested screen exists.
- UI-3: same conditions. New commander at Lave, 1280x720, no NPC traffic, the ship stopped just after the launch. The optional NPC pair is one Viper 1,500 m dead ahead, facing the player: Oolite by OXP with `oolite-nullAI.js`; Wegolite by `spawnTestShooter()` under `?test=1&traffic=1` (`src/app/probe.ts:298-312`). It gets one attempt per side. If either side fails, drop the pair and record why: Wegolite's only spawn hook needs traffic on and fires, so a second attempt would need a new hook in `src/`, which is out of scope.
- UI-4: comparison. The executor looks at every PNG with the Read tool and writes `/tmp/ooref-ui/compare.html` by hand: relative image paths, one `section data-pair="<name>"` per pair, notes per pair, and an `ol id="ranked"` list.
- UI-5: classification. R1 is information: a field, value, label, unit or element is missing, extra or different. R2 is layout: position, size, order, scanner or chart geometry. R3 is style: colour, font, weight, borders. D is a deliberate Wegolite difference already recorded; it cites the PROJECT.md Key Decisions row or the commit. N is noise: llvmpipe against SwiftShader, font rasterisation, antialiasing, star field, planet texture detail, station roll phase. N is noted once and ignored. Rank R1 first, then R2, then R3. Within a class, rank by how much play time the screen gets: flight HUD, then market, status, chart, system data.
- UI-6: recording. Use FIDELITY.md Open items, not Mechanics or Excerpts: `tests/contract/fidelity.test.ts` parses only those two sections. Write at most three new todos, one per screen group (flight HUD, station screens, chart), and only for groups with R1/R2 items or R3 items that matter. Put an item in an existing todo instead when one already covers it. Update the measurement todo.
- UI-7: gates. Only docs change, so run the fidelity contract test and `prettier --check FIDELITY.md` remotely after the commit (`.planning/` is prettier-ignored). Do not run `verify`, `verify-full` or `e2e`. The scratch Playwright run is a capture, not a gate, and does not change D-08 (no pixel evidence in the test suite). No CHANGELOG entry: nothing user-visible changes.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@tools/oolite-reference/README.md
@.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
@.planning/quick/261117-lka-measure-mass-lock-range-and-jump-blockag/261117-lka-SUMMARY.md

Reviewer and subagent brief (AGENTS.md, quoted; include it in any subagent prompt):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Working rules for this plan:
- Use the codebase-memory MCP index (project `wegolite`) before grepping; fall back to `rg` (never `grep`) for literals and non-code files.
- Read Oolite behaviour from `/home/opencode/git/oolite` (local checkout); never fetch Oolite files over the network.
- Browser runs happen ONLY on the remote machine `opencode@192.168.178.51`, through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <docker compose args>`. It syncs the COMMITTED HEAD to `~/wegolite-remote` (wiped on every run) and runs `docker compose` there.
- One Oolite reference session at a time and one wrapper run at a time. Run them one after the other, never concurrently.
- Patterns to copy, not re-derive:
  - Oolite OXP structure, launch, `maxSpeed = 0` stop and the entity freeze: `/tmp/ooref-masslock/addons/wegolite-masslock.oxp/Config/script.js` (outside the repository, from 261117-lka).
  - Oolite title-to-docked key sequence: `tools/oolite-reference/steps/docked.steps`.
  - Wegolite chart open and the Lave hover: `tests/e2e/chart-gestures.spec.ts:123-149` (its local `bootDocked`, `openChart` and `markerPoint` helpers).
  - Home navigation: `tests/e2e/station-tabs.spec.ts:261-262`.
  - Launch and mode waits: `tests/e2e/launch.spec.ts:34-72`.
  - Hook pose and speed calls: `tests/e2e/autosave.spec.ts:340-355`.
  - Traffic opt-in and the shooter: `tests/e2e/combat.spec.ts:241-247`.
- Probe fields the spec reads (`src/app/probe.ts`): `mode`, `position`, `speed`, `world.station`, `hud.contacts`, `hud.message`, `torus.massLocked`. The hook is `window.__wegolite.test`, with `setSpeed` and `spawnTestShooter`.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: End-to-end status-screen pair (Oolite F5 and Wegolite F5 into compare.html)</name>
  <files>/tmp/ooref-ui/tracer.steps, /tmp/ooref-ui/wego-src/tracer.spec.ts, /tmp/ooref-ui/compare.html</files>
  <precondition>The remote image exists (`ssh opencode@192.168.178.51 docker image inspect wegolite-oolite-reference:1.93.1-255` exits 0), and no other Oolite reference session or wrapper run is active.</precondition>
  <action>
Prove the whole pipeline on one pair before building the full set (UI-1, UI-2, UI-4). Every file stays under `/tmp/ooref-ui/`.

1. Oolite. Write `/tmp/ooref-ui/tracer.steps` from `tools/oolite-reference/steps/docked.steps`, without its title and scenario shots: `window 120`, `sleep 10`, `key Return`, `sleep 3`, `key Return`, `sleep 10`, `key F5`, `sleep 3`, `shot status`. Run `tools/oolite-reference/run-remote.sh --no-build --steps /tmp/ooref-ui/tracer.steps --out /tmp/ooref-ui/oolite-tracer --timeout 300`. The run needs no OXP. Expect `exit=0` and `/tmp/ooref-ui/oolite-tracer/screenshots/01-status.png`.
2. Wegolite. Write `/tmp/ooref-ui/wego-src/tracer.spec.ts` as one Playwright test with `test.setTimeout(300_000)`. It goes to `/?test=1`, calls `waitForReady` and `startNewGame` (import them from `./helpers/probe.js` and `./helpers/title.js`, because the file runs from `tests/e2e/` in the container) and waits for probe mode `docked`. It presses F5, waits for `#station-screen[data-screen="status"]`, waits 1 s and saves `page.screenshot` to `/scratch/out-tracer/status.png`.
   Run it:
   - Prepare the remote directory: `ssh opencode@192.168.178.51 "mkdir -p /tmp/ooref-ui-wego/out-tracer"`.
   - Copy the spec: `scp /tmp/ooref-ui/wego-src/tracer.spec.ts opencode@192.168.178.51:/tmp/ooref-ui-wego/`.
   - Start the run: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm -v /tmp/ooref-ui-wego:/scratch e2e sh -lc "npm run build:e2e && cp /scratch/tracer.spec.ts tests/e2e/zz-ui-tracer.spec.ts && npx playwright test tests/e2e/zz-ui-tracer.spec.ts --project=chromium"`. Run it in the background with output to `/tmp/ooref-ui/wegolite-tracer-run.log`, and wait for it to finish.
   - Fetch the result: `mkdir -p /tmp/ooref-ui/wegolite-tracer && scp 'opencode@192.168.178.51:/tmp/ooref-ui-wego/out-tracer/*' /tmp/ooref-ui/wegolite-tracer/`.
   If the compose `-v` mount or the copy into `tests/e2e/` fails, find the least invasive working alternative that still keeps the spec out of the local repository: for example `--config` with a scratch config placed in the remote tree, or a direct `ssh ... docker compose run` in `~/wegolite-remote` after a wrapper sync. Record it as a Rule 3 deviation and reuse it in Task 2.
3. Look at both PNGs with the Read tool. Write `/tmp/ooref-ui/compare.html`: a minimal static page with one `section data-pair="status"`, the two images side by side through relative paths (`oolite-tracer/screenshots/01-status.png`, `wegolite-tracer/status.png`) at their native 1280 px width inside a horizontally scrolling row, and a short notes list. No external resources and no scripts.
4. Confirm that `git status --porcelain` in the repository shows no scratch artefact.
  </action>
  <verify>
    <automated>O=/tmp/ooref-ui/oolite-tracer/screenshots/01-status.png; W=/tmp/ooref-ui/wegolite-tracer/status.png; C=/tmp/ooref-ui/compare.html; file "$O" | rg -q '1280 x 720' && file "$W" | rg -q '1280 x 720' && rg -q 'oolite-tracer/screenshots/01-status\.png' "$C" && rg -q 'wegolite-tracer/status\.png' "$C" && rg -q 'data-pair="status"' "$C" && rg -q '^exit=0' /tmp/ooref-ui/oolite-tracer/session.txt && S="$(git status --porcelain)" && test -z "$(printf '%s\n' "$S" | rg -i '\.(png|log|steps|oxp|html)$|script\.js$|zz-ui|ui-capture|tracer\.spec')"  # gates: both PNGs 1280x720 [HEAD=absent EXPECT==present]; compare.html pair [HEAD=absent EXPECT==present]; scratch artefacts in git status [HEAD=0 EXPECT==0 GUARD MUTATION: copying tracer.spec.ts into tests/e2e/ locally]</automated>
  </verify>
  <done>Both status screenshots exist at 1280x720 under /tmp/ooref-ui/, compare.html shows them side by side, and the local repository has no scratch file. The Oolite run exited 0, and the remote Playwright path (mount, copy, run, fetch) is proven.</done>
</task>

<task type="auto">
  <name>Task 2: Capture the full screen set in both games and write the ranked comparison</name>
  <files>/tmp/ooref-ui/addons/wegolite-ui.oxp/Config/script.js, /tmp/ooref-ui/ui.steps, /tmp/ooref-ui/wego-src/ui-capture.spec.ts, /tmp/ooref-ui/compare.html</files>
  <action>
Expand from the proven slice to every screen (UI-1 to UI-5). Do the Oolite run first and the Wegolite run second, never concurrently.

1. Oolite OXP, `/tmp/ooref-ui/addons/wegolite-ui.oxp/Config/script.js`. It is a world script modelled on the 261117-lka script: `this.name = "wegolite-ui"`, `this.author`, `this.version = "0.0.1"`. Every log uses the two-argument `log(this.name, ...)`, and every handler has a try/catch that logs `ERROR <what> <exception>`.
   - `startUpComplete` logs `UI-DOCKED system=<system.name> docked=<player.ship.docked> credits=<player.credits>`.
   - `shipLaunchedFromStation(station)` runs once and keeps `station`. It removes the NPC traffic: every ship in `system.allShips` that is not the player, not `isStation` and whose `scanClass` is not `CLASS_BUOY`, through `remove(true)`. It logs `UI-REMOVED n=<count>`, saves `player.ship.maxSpeed` and sets it to 0.
   - A frame callback waits for `player.ship.speed === 0`. It then restores `maxSpeed`, removes the traffic again, removes itself and logs `UI-STOPPED dist=<player.ship.position.distanceTo(station.position)> massLocked=<player.alertMassLocked> speed=<player.ship.speed>`. It starts a 15 s `Timer` for the NPC.
   - The NPC step: spawn one `viper` (shipdata key `viper`, `/home/opencode/git/oolite/Resources/Config/shipdata.plist:4537`) 100 km above the player, as 261117-lka did to avoid a collision. Move it to `player.ship.position + player.ship.vectorForward x 1500`, with its nose toward the player (the player's orientation turned half a turn about the player's `vectorUp`). Freeze it the way 261117-lka did: `switchAI("oolite-nullAI.js")`, speed 0, zero velocity, and the position re-asserted every frame. Log `UI-NPC dist=<distance to the player>`.
2. Steps file `/tmp/ooref-ui/ui.steps`, one verb per line in this order:
   - Start: `window 120`, `sleep 10`, `key Return`, `sleep 3`, `key Return`, `waitlog 60 UI-DOCKED`, `sleep 8`.
   - Docked screens: `key F5`, `sleep 3`, `shot status`; `key F8`, `sleep 3`, `shot market`; `key F7`, `sleep 3`, `shot sysdata`; `key F6`, `sleep 3`, `shot chart-short`; `key F6`, `sleep 3`, `shot chart-galactic`.
   - Launch and flight: `key F5`, `sleep 3`, `key F1`, `waitlog 120 UI-STOPPED`, `sleep 3`, `shot flight`; `key j`, `shot message`, with no sleep between them because the message lasts 1.5 s; `waitlog 60 UI-NPC`, `sleep 3`, `shot npc`.
   F7 comes before any chart key, so it shows the current system, Lave. Run `tools/oolite-reference/run-remote.sh --no-build --steps /tmp/ooref-ui/ui.steps --addons /tmp/ooref-ui/addons --out /tmp/ooref-ui/oolite --timeout 600`. Expect `screenshots/01-status.png` to `08-npc.png`.
   One rerun, into a fresh `--out`, is allowed in two cases: `07-message.png` lacks the message, or a docked shot is not the screen it is named for. Otherwise record the gap. If only the NPC part fails, keep the run and drop the NPC pair (UI-3).
3. Wegolite spec `/tmp/ooref-ui/wego-src/ui-capture.spec.ts`, two tests, each with `test.setTimeout(600_000)`. Copy the needed helpers from the files named in the context: `bootDocked`, `openChart` and `markerPoint` from chart-gestures, the Home tab from station-tabs, and `waitForMode` from launch.
   - Test "screens and flight", at `/?test=1`, saves its shots under `/scratch/out/`:
     - Start a new game and wait for mode `docked`.
     - F5, wait for the status screen, 1 s, `status.png`. F8, wait for the market screen, 1 s, `market.png`.
     - F6, open the chart, 2 s, `chart-local.png`. Hover the Lave marker until `#chart-tooltip` shows the title Lave, then `sysdata.png`. Move the mouse to (1, 1) until the tooltip hides. Tab, 2 s, `chart-galaxy.png`.
     - Escape, go Home, click `button[data-action="launch"]` and wait for mode `inFlight` (up to 180 s). Call `window.__wegolite.test.setSpeed(0)`, wait 3 s, then `flight.png`.
     - Record `position`, `world.station`, the station distance, `hud.contacts`, `torus.massLocked` and `hud.message`.
     - Press KeyJ, wait until `hud.message` is `Hyperspeed mass-locked.` (up to 10 s), then save `message.png` at once.
     - Write all readings to `/scratch/out/capture.json`.
   - Test "npc", at `/?test=1&traffic=1`: the same start, launch and `setSpeed(0)`, then a 3 s wait. `spawnTestShooter()` must return true. Wait 1 s, then save `npc.png`, and write the contacts and the player's shield and energy readings to `/scratch/out/capture-npc.json`. Before the 3 s wait, record any traffic ships that appear on the scanner, as a known condition difference.
   Run it the way Task 1 did, with these changes:
   - Recreate `/tmp/ooref-ui-wego/out` on the remote.
   - Copy `ui-capture.spec.ts` there, and inside the container to `tests/e2e/zz-ui-capture.spec.ts`.
   - Log to `/tmp/ooref-ui/wegolite-run.log`, and fetch into `/tmp/ooref-ui/wegolite/`.
   - Afterwards remove the remote scratch directory through a throwaway container, because its files are root-owned: `ssh opencode@192.168.178.51 "docker run --rm -v /tmp/ooref-ui-wego:/w busybox:1.36 sh -c 'rm -rf /w/* /w/.[!.]* 2>/dev/null; true'; rm -rf /tmp/ooref-ui-wego"`.
   A failed "npc" test alone does not block; drop the pair under UI-3.
4. Compare. Look at every PNG of both sets with the Read tool, and check the Wegolite readings in capture.json. Pair them:
   - status with status, market with market, sysdata with sysdata (the Lave hover card standing in for F7, per commit c1c9897).
   - chart-short with chart-local, and chart-galactic with chart-galaxy.
   - flight with flight, message with message, npc with npc.
   For each pair, note what each game shows:
   - status: commander, rating, legal status, credits, fuel, location, ship, equipment and cargo lists, the date line.
   - market: columns, units, the price and stock of every row at Lave, header and footer.
   - sysdata: economy, government, tech level, population, productivity, radius, description, distance.
   - charts: framing and zoom, markers, the range circle, labels, cursor.
   - flight: the scanner (shape, size, position, range rings, the station and buoy blips with their stalks), compass, crosshair, every bar and gauge, clock, condition light, missile icons, aegis indicator, the message area, and the forward view.
   - message: text, position, colour, size, fade.
   - npc: blip colour and shape, model.
   Compare the Oolite `UI-STOPPED dist` with the Wegolite station distance, and treat a blip offset that the distance explains as a condition difference, not a UI difference.
   Classify each difference by UI-5. Before calling anything a fixable difference, check `.planning/PROJECT.md` Key Decisions and `git log` for a recorded decision; if one exists, classify it D and cite it. Expected decided items: the tab strip and the Home screen (Key Decisions row "Add a clickable F-key-ordered tab strip..."), the F7 removal (c1c9897), and the chart camera presets (row "Replace the F6 chart's Short/Long sub-tabs..."). For each R1 or R2 item, name the Oolite source that draws it: `Resources/Config/hud.plist`, `src/Core/GuiDisplayGen.m`, or the `src/Core/Entities/PlayerEntity*.m` screen code. Also name the Wegolite file: `index.html`, `src/ui/*` or `src/hud/*`.
5. Rewrite `/tmp/ooref-ui/compare.html` with:
   - an intro naming both builds and the commit SHA, the conditions and the Oolite `UI-STOPPED` line;
   - an `ol id="ranked"` with every R1, R2 and R3 item in rank order, each tagged with its class and pair;
   - a "Decided" list with the citations, and one "Noise" paragraph;
   - one `section data-pair="<name>"` per captured pair, with both images and the notes;
   - a list of dropped pairs with the reason.
   It uses relative paths only, with no external resources or scripts. Leave the tracer images where they are; the new page uses `oolite/` and `wegolite/`.
  </action>
  <verify>
    <automated>O=/tmp/ooref-ui/oolite; W=/tmp/ooref-ui/wegolite; C=/tmp/ooref-ui/compare.html; test "$(for n in 01-status 02-market 03-sysdata 04-chart-short 05-chart-galactic 06-flight 07-message; do file "$O/screenshots/$n.png"; done | rg -c '1280 x 720')" -eq 7 && test "$(for n in status market sysdata chart-local chart-galaxy flight message; do file "$W/$n.png"; done | rg -c '1280 x 720')" -eq 7 && rg -q '\[wegolite-ui\]: UI-STOPPED dist=' "$O/logs/Latest.log" && ! rg -q '\[wegolite-ui\]: ERROR' "$O/logs/Latest.log" && rg -q 'Hyperspeed mass-locked\.' "$W/capture.json" && test "$(rg -c 'data-pair=' "$C")" -ge 7 && rg -q 'id="ranked"' "$C" && S="$(git status --porcelain)" && test -z "$(printf '%s\n' "$S" | rg -i '\.(png|log|steps|oxp|html)$|script\.js$|zz-ui|ui-capture|tracer\.spec')"  # gates: Oolite shots 1280x720 [HEAD=0 EXPECT==7]; Wegolite shots 1280x720 [HEAD=0 EXPECT==7]; OXP stop line [HEAD=absent EXPECT==present]; OXP ERROR lines [HEAD=absent EXPECT==absent GUARD MUTATION: a throwing shipLaunchedFromStation]; message reading [HEAD=absent EXPECT==present]; compare pairs [HEAD=0 EXPECT>=7]; scratch artefacts in git status [HEAD=0 EXPECT==0 GUARD MUTATION: copying ui-capture.spec.ts into tests/e2e/ locally]</automated>
  </verify>
  <done>Seven pairs, or eight with the NPC, are captured at 1280x720 under the same conditions. compare.html shows them with notes, a ranked R1/R2/R3 list, a Decided list with citations, one Noise paragraph and any dropped pairs with reasons. Nothing is in the repository or published, and the remote scratch directory is gone.</done>
</task>

<task type="auto">
  <name>Task 3: Record the ranked list in FIDELITY.md and the todos, commit, run the remote doc gates</name>
  <files>FIDELITY.md, .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md, .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md, .planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md, .planning/todos/pending/2026-11-17-ui-chart-differences-from-oolite.md</files>
  <action>
Turn the comparison into tracked work (UI-5, UI-6, UI-7). Quote no Oolite text beyond short UI strings needed to name a difference, and commit no image, log, OXP, steps file or spec.

1. New todos, at most three and only for groups with items worth fixing. Use these names, and create a group's file only if that group has items:
   - `.planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md` (flight, message, npc pairs);
   - `.planning/todos/pending/2026-11-17-ui-station-screen-differences-from-oolite.md` (status, market, sysdata);
   - `.planning/todos/pending/2026-11-17-ui-chart-differences-from-oolite.md` (both charts).
   Follow the existing todo format (see `.planning/todos/pending/2026-11-11-terminal-color-palette-setting.md`): frontmatter `created` (2026-11-17 ISO time), `title`, `area: ui`, `severity` (`normal` if the group has an R1 item, otherwise `minor`) and `files` (the Wegolite files involved); then `## Problem` and `## Solution`. Problem names quick task 261117-nfn, the compare.html pair names (local only, not committed) and one bullet per difference: class, what Oolite shows, what Wegolite shows, the Oolite source and the Wegolite file. Solution lists the likely change per bullet, without implementing it. If an existing pending todo already covers an item, add a bullet there instead, naming 261117-nfn.
2. FIDELITY.md, `## Open items` only. Do not touch Mechanics, Excerpts or the Constants ledger. Write each bullet as one line, like the existing bullets.
   - Add a bullet after `**Reference Oolite for measurements.**`: `**UI screens compared with a running Oolite (quick task 261117-nfn).**`. It gives the conditions in one sentence: Oolite 1.93.1-255 against the Wegolite commit SHA, a new commander at Lave, 1280x720, F7 compared with the chart hover card because c1c9897 removed it. Then the ranked R1 and R2 items in order, briefly, and the count of R3 items. Then the decided items with their citations, the noise sentence, any dropped pair, and the todo files that carry the work.
   - In the `**Reference Oolite for measurements.**` bullet, replace the closing sentence that lists "the UI comparison" as open: say the UI screens were compared in quick task 261117-nfn, and that the wreck lifetime and the explosion and debris look stay open in the measurement todo.
3. The measurement todo, `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`. Keep it in `pending/`.
   - Append to step 4 on its own line: `**Done** (quick task 261117-nfn, 2026-11-17)`, with a one-sentence result (pairs compared, counts per class, todo files).
   - Rewrite the `Open:` paragraph so that it lists only the Phase 16 wreck lifetime and explosion items, plus any reported item still waiting for the owner.
4. Commit by file name; never use `git add -A`. Message: `docs(quick-261117-nfn): record the UI comparison with a running Oolite`, ending with the attribution line from the session's system reminder.
5. Run the remote checks against the committed HEAD, one after the other:
   - `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npx vitest run tests/contract/fidelity.test.ts`
   - `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm lint npx prettier --check FIDELITY.md`
   If prettier fails, fix the markdown by hand, commit the fix as a separate `docs(quick-261117-nfn)` commit, and rerun. Do not run verify, verify-full or e2e (UI-7). No `src/sim/npc/**` or `src/sim/world/**` file changes, so the NPC acceptance run is not due.
6. SUMMARY: see the output section.
  </action>
  <verify>
    <automated>R=/home/opencode/.claude/scripts/wegolite-remote-run.sh; T=.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md; test "$(rg -c '261117-nfn' FIDELITY.md)" -ge 2 && test -f "$T" && rg -q '261117-nfn' "$T" && git diff --quiet 5a4e4cd HEAD -- src tests tools index.html && D="$(git diff --name-only 5a4e4cd HEAD)" && test -z "$(printf '%s\n' "$D" | rg -i '\.(oxp|png|log|steps|html)$|script\.js$|\.spec\.ts$')" && "$R" run --rm test npx vitest run tests/contract/fidelity.test.ts && "$R" run --rm lint npx prettier --check FIDELITY.md  # gates: FIDELITY 261117-nfn [HEAD=0 EXPECT>=2]; measurement todo 261117-nfn [HEAD=0 EXPECT>=1]; todo still in pending [HEAD=present EXPECT==present GUARD MUTATION: moving it to .planning/todos/completed/]; files changed under src/tests/tools/index.html since 5a4e4cd [HEAD=0 EXPECT==0 GUARD MUTATION: committing tests/e2e/zz-ui-capture.spec.ts]; Oolite or scratch artefacts committed [HEAD=0 EXPECT==0 GUARD MUTATION: committing /tmp/ooref-ui/oolite/screenshots/01-status.png]</automated>
  </verify>
  <done>FIDELITY.md Open items carry the ranked UI differences under 261117-nfn, and the Reference Oolite bullet no longer lists the UI comparison as open. Each difference worth fixing is a bullet in a pending todo. The measurement todo marks step 4 done and stays open for the Phase 16 items. Nothing in src/, tests/, tools/ or index.html changed, and nothing Oolite-derived was committed. The fidelity contract test and prettier pass remotely on the committed HEAD.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local host -> remote test machine (ssh, scp) | run-remote.sh and the wegolite wrapper sync code; the scratch spec is copied to `/tmp/ooref-ui-wego` on the remote; outputs come back to `/tmp/ooref-ui/` |
| OXP script -> Oolite in the container | our own JS runs inside Oolite with `--network none`, as a non-root user, with add-ons mounted read-only |
| scratch spec -> e2e container -> remote synced tree | the spec is copied into `~/wegolite-remote/tests/e2e/` on the remote only; that tree is wiped by the next wrapper run |
| Oolite and Wegolite output -> local /tmp -> repository docs | the screenshots contain CC BY-NC-SA art (Oolite output and Oolite-derived Wegolite assets); only prose descriptions and short UI strings may enter the docs |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-nfn-01 | Information disclosure (licence) | repository commits | high | mitigate | Every PNG, log, OXP, steps file, spec and compare.html lives under `/tmp/ooref-ui/`. run-remote.sh refuses an in-repo `--out` (exit 64). Tasks 1 and 2 check `git status` for scratch artefacts; Task 3 checks that none was committed since 5a4e4cd and stages files by name only. |
| T-nfn-02 | Information disclosure (publication) | compare.html | high | mitigate | The page is written only to `/tmp/ooref-ui/`, has no external resources and is never uploaded, published or attached anywhere; the SUMMARY gives its local path only. |
| T-nfn-03 | Tampering (scratch spec leaking into the repo) | tests/e2e | medium | mitigate | The spec is copied into the remote synced tree inside the container, never into the local checkout; the git status gates in Tasks 1 and 2 and the `src tests tools index.html` diff gate in Task 3 catch a local copy. |
| T-nfn-04 | Tampering (comparison integrity) | capture conditions | medium | mitigate | Same commander state, resolution, traffic removal and stop rule in both games; the Oolite `UI-STOPPED dist` and the Wegolite station distance are recorded so a blip offset is attributed to distance, not UI; every D item cites its recorded decision; noise is named once so it cannot inflate the list. |
| T-nfn-05 | Denial of service (remote leftovers) | remote /tmp/ooref-ui-wego | low | mitigate | Root-owned outputs are removed through a throwaway busybox container, the same way the wrapper clears its tree. |
| T-nfn-06 | Elevation of privilege | OXP JS inside Oolite | low | accept | Our own script; the container runs with no network, as a non-root user, with only `/out` writable (261117-iuw). |
| T-nfn-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs in this plan. The Oolite binary is the SHA256-pinned AppImage already in the remote image (`--no-build`); Playwright and Chromium come from the existing `wegolite-ci` image. |
</threat_model>

<verification>
- The Task 1 and Task 2 automated checks pass on the fetched outputs under `/tmp/ooref-ui/`.
- `/tmp/ooref-ui/compare.html` opens locally, and shows every captured pair, the ranked list, the Decided list with citations, the Noise paragraph and any dropped pair with its reason.
- The Task 3 automated check passes, including the remote fidelity contract test and the prettier check on the committed HEAD.
- No `verify`, `verify-full` or `e2e` gate was run (UI-7); the only Playwright runs were the scratch captures.
</verification>

<success_criteria>
- A matched set of Oolite and Wegolite screenshots exists for status, market, system data (the hover card in Wegolite), both charts, the in-flight HUD with the station on the scanner, and the mass-lock message, plus the NPC pair if it worked on the first attempt.
- Every difference is classified and ranked. The fixable ones are in pending todos, the decided ones cite their decisions, and noise is noted once.
- FIDELITY.md, the SUMMARY and the measurement todo record the result, and nothing Oolite-derived or scratch is committed.
</success_criteria>

<output>
Create `.planning/quick/261117-nfn-compare-wegolite-ui-screens-with-real-oo/261117-nfn-SUMMARY.md` when done. Include:
- The conditions: Oolite build and SHA256, Wegolite commit SHA, resolution, commander state, traffic handling, the stop rule, the Oolite `UI-STOPPED` line and the Wegolite station distance.
- The pairs captured and dropped (with reasons), and the local path `/tmp/ooref-ui/compare.html` (not committed, not published).
- The ranked difference list as a table (`.planning/` is prettier-ignored): rank, class, pair, Oolite, Wegolite, Oolite source, Wegolite file, todo.
- The Decided list with citations, and the one Noise sentence.
- The full `session.txt` and `wrapper.txt` of each accepted Oolite run, the Wegolite wrapper's `exit=` line for each capture run, and any Rule 3 deviation (for example the remote Playwright mount path).
- The remote gate results of Task 3.
</output>
