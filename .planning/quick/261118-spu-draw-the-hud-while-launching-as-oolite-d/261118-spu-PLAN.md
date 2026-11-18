---
phase: quick
plan: 261118-spu
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/hud-model.ts
  - src/render/hud/draw.ts
  - src/app/session/render-driver.ts
  - src/app/probe.ts
  - src/app/session/probe-publisher.ts
  - src/main.ts
  - tests/ui/hud-model.test.ts
  - tests/hud/clock-lines.test.ts
  - tests/hud/cap-text.test.ts
  - tests/app/session/render-driver.test.ts
  - tests/fixtures/probe-shape.json
  - tests/e2e/launch.spec.ts
  - CHANGELOG.md
  - FIDELITY.md
  - .planning/PROJECT.md
  - .planning/todos/pending/2026-11-18-draw-the-hud-while-launching.md
  - .planning/todos/completed/2026-11-18-draw-the-hud-while-launching.md
autonomous: true
requirements: [FLGT-01, FLGT-05]
estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 2
  confidence: low
must_haves:
  truths:
    - "OD-1: through the launch pre-roll and the 2 s launch the flight HUD canvas is visible and drawn (scanner, bars, message rows, condition light, aegis strip, clock lines); the page overlay's version and system lines stay hidden"
    - "OD-2: while launching (and in the pre-roll) the compass draws its ring and ticks but no target blip, as Oolite's drawCompass skips the blip when the status is STATUS_LAUNCHING; Wegolite draws no ASC target line, so nothing else needs hiding"
    - "OD-3: while launching (and in the pre-roll) the roll bar reads 0 although the sim's rollRate is the station rate; the hull keeps rolling with the station (D-10 unchanged)"
    - "PD-1: the pre-roll HUD reads the launch start values (half top speed, clock +600 s, yellow condition, aegis S, scanner from the dock mouth), so no HUD value jumps at the pre-roll to launch boundary; the live flight state is never written"
    - "PD-3: no first-use hint fires in the pre-roll or the launch that did not fire before; hints keep reading the live sim state"
    - "At handover the compass target blip is drawn again"
    - "No file under src/sim, tests/golden or src/content/generated changes; no flight hash, twin hash or golden moves"
  artifacts:
    - path: src/app/hud-model.ts
      provides: "preRollHudState (launch start values on a copy) and the launching rules: compass blip off, roll bar 0"
    - path: src/render/hud/draw.ts
      provides: "HudCompass.blip; drawCompass draws ring and ticks always, the target blip only when blip is true"
    - path: src/app/session/render-driver.ts
      provides: "HUD shown in the launch view; pre-roll model built from preRollHudState"
    - path: src/app/probe.ts
      provides: "hud.compass.blip probe field"
    - path: tests/e2e/launch.spec.ts
      provides: "HUD visible in the pre-roll and the launch, compass blip absent, blip back at handover"
  key_links:
    - from: src/app/session/render-driver.ts
      to: src/app/hud-model.ts
      via: "preRollHudState(...) then buildHudModel(hudState, ...) while pre-rolling; buildHudModel(currentState, ...) otherwise"
    - from: src/app/hud-model.ts
      to: src/render/hud/draw.ts
      via: "HudCompass.blip set from state.mode; HudBars.roll forced to 0 while launching"
    - from: src/app/session/probe-publisher.ts
      to: src/app/probe.ts
      via: "probe.hud.compass.blip = lastModel.compass.blip"
---

<objective>
Draw the flight HUD during the launch pre-roll and the launch, as Oolite draws it while launching
(`Universe.m:4718-4732` at 7437f22 skips the HUD only when dead, in the escape sequence or at game start), with the
compass target blip hidden (`HeadUpDisplay.m:1494`), no ASC target line (`HeadUpDisplay.m:2756`; Wegolite has none)
and the roll bar at 0 (`PlayerEntity.m:6469-6470`). Presentation only: no sim change, no hash or golden moves.

Purpose: owner decision 2026-11-18 (locked) closes todo `2026-11-18-draw-the-hud-while-launching`; quick 261118-l26
hid the HUD until handover and quick 261118-os8 kept it hidden through the new pre-roll.
Output: the HUD in the launch view, a `hud.compass.blip` probe field, unit and browser tests, a frame capture looked
at on the remote, and the records (PROJECT.md row, FIDELITY rows, CHANGELOG, todo closed).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/todos/pending/2026-11-18-draw-the-hud-while-launching.md
@.planning/quick/261118-os8-add-a-1-5-s-pre-roll-inside-the-dock-slo/261118-os8-SUMMARY.md
@src/app/session/render-driver.ts
@src/app/hud-model.ts
@src/sim/flight/launch.ts

Reviewer and subagent brief (AGENTS.md, quoted; include it in every subagent prompt):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is
  not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted),
  `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser),
  `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`,
  `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container:
  `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Owner policy for this task: `test`, `lint` and `typecheck` run in local Docker. Every browser run (the launch spec, the
probe-shape write check, the frame capture) and `verify-full` run only on the remote, through
`/home/opencode/.claude/scripts/wegolite-remote-run.sh <docker compose args>`, which syncs the COMMITTED HEAD (commit
first) to `opencode@192.168.178.51`. One remote run at a time; run `verify-full` in the background and wait for it.
Oolite behaviour is read from the local checkout `/home/opencode/git/oolite` (its HEAD is 21978c37b, not the pinned
7437f22, so quote and cite lines from `git -C /home/opencode/git/oolite show 7437f22:<path>`); never fetch Oolite over
the network. Use the codebase-memory index (project `wegolite`) before grepping; prefer `rg` over `grep`.
Plan base commit: 25010b6.

<design_decisions>
Owner decisions (locked 2026-11-18):
- OD-1: draw the flight HUD during the pre-roll and the launch. The version/system overlay lines stay hidden
  (`index.html` hides them while `#hud` is not hidden, and the `data-launching` mark stays toggled for the whole
  launch view as today).
- OD-2: compass hidden while launching. Oolite's `drawCompass:` draws the ring and the four ticks first and skips only
  the target blip under `[PLAYER status] != STATUS_LAUNCHING` (`HeadUpDisplay.m:1480-1494` in the checkout). Wegolite
  follows that: ring and ticks drawn, no blip. ASC targets (`drawASCTarget:`, `:2756`): Wegolite draws no ASC target
  line at all (`drawCompass` doc in `src/render/hud/draw.ts`: "No caption is drawn"), so nothing else is hidden.
- OD-3: the roll bar reads 0 while launching (Oolite `flightRoll = 0; // don't spin when showing the break pattern.`).
  Presentation only; the sim keeps `rollRate = stationRollRadPerSec` while launching (D-10). Oolite restores
  `flightRoll` once `breakPatternHide` turns false (counter at most 5, `PlayerEntity.m:3521-3522`,
  `Universe.m:3516-3520`), so its bar shows the station spin only in the last moments; Wegolite holds 0 to handover,
  where `completeLaunch` already sets `rollRate` 0, so the bar does not jump at handover. Record this nuance in
  FIDELITY.
- OD-4: everything else as in flight: scanner, bars, message rows, hints, condition light, aegis strip per the existing
  `aegisStatus` rule.
- OD-5: no sim change; hashes and goldens must not move.

Planner decisions (discretion, justified):
- PD-1 (pre-roll HUD state): during the pre-roll the sim is docked, so the HUD reads a presentation copy of the launch
  start state: `preRollHudState` shallow-copies the live state, applies `beginLaunch` to the copy (one source of truth
  for the +600 s clock, the dock mouth position, the launch twist, half top speed, pitch 0 and mode `launching`), then
  sets the copy's position and orientation to the pre-roll pose the camera is drawn from (`preRollPose`, which equals
  the `beginLaunch` pose at view time 1.5 s). Why: the camera represents the launch about to happen, Oolite shows the
  launch speed from the first launch frame, and the HUD on the last pre-roll frame then equals the HUD on the first
  launch frame (speed, clock text, condition yellow, aegis S, compass ring without blip, roll 0, shields, energy,
  temperatures and fuel, which the launch step does not change). Showing the docked clock and speed 0 instead would
  make the clock jump 10 minutes and the speed bar jump to half in the middle of one continuous camera move. The
  probe's `clock` and `mode` stay the sim's (docked, clock unchanged), so the e2e pre-roll assertions on them hold.
  Accepted boundary changes that are not flashes: NPC contacts appear on the scanner at the launch step because the
  sim creates the world there (unchanged sim behaviour); the "Launching — stand by" message row appears at the launch
  step (the "launched" handler enqueues it); the scanner buoy flash phase is frozen during the pre-roll because flight
  time does not advance while docked, and starts blinking at the boundary.
- PD-2 (blip rule): `HudCompass.blip` is true only when `state.mode === "inFlight"` (Oolite: `checkPlayerInSystemFlight`
  and not launching; docked never shows the HUD). The compass target is still resolved and published, so the probe's
  `hud.compass.target` keeps its meaning.
- PD-3 (hints): no change to `src/app/hints.ts`. `showHint` keeps receiving the live sim state (docked in the pre-roll),
  never the preview copy: with the copy, `markSeen("launch")` would fire 1.5 s early and the hint routing would leave
  the station line. `maybeShow` returns only the docked "launch" hint (already announced on the docked panel before the
  press) or null while launching, so no hint can fire in the pre-roll or the launch. The only input the HUD change
  touches is `ctx.core.lastModel` (gauges), now refreshed during the launch view instead of holding the last in-flight
  model from before docking; gauge hints read it only in `inFlight`, where the frame's own model is built first, so the
  first in-flight gauge hints read current bars (an improvement, not a regression).
- PD-4 (probe): add `hud.compass.blip: boolean` so the browser spec can assert the blip is absent while launching
  (pixels cannot). This adds a key to the probe-shape fixture: hand-edit the seven `compass` entries, then confirm with
  a remote `WEGOLITE_PROBE_SHAPE_WRITE=1` run that the recorded fixture is JSON-identical, key order included.
</design_decisions>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Draw the HUD through the launch view: launching rules, pre-roll launch-start state, blip gate</name>
  <files>src/app/hud-model.ts, src/render/hud/draw.ts, src/app/session/render-driver.ts, tests/ui/hud-model.test.ts, tests/hud/clock-lines.test.ts, tests/hud/cap-text.test.ts, tests/app/session/render-driver.test.ts</files>
  <read_first>src/app/hud-model.ts (whole), src/render/hud/draw.ts (lines 250-325, 535-660, 1090-1140), src/app/session/render-driver.ts (whole), src/sim/flight/launch.ts (lines 87-130), src/render/launch-camera.ts (lines 240-265), src/sim/flight/state.ts (FlightPose at line 86, hashFlight at 198), src/app/hints.ts (lines 200-270), tests/app/session/render-driver.test.ts (lines 80-200 harness, 990-1160 the l26/os8 launch tests), tests/ui/hud-model.test.ts (lines 1-60), tests/hud/clock-lines.test.ts (lines 1-150, 221-260), tests/hud/cap-text.test.ts (around line 232), /home/opencode/git/oolite/src/Core/HeadUpDisplay.m (lines 1455-1500, 2752-2760)</read_first>
  <behavior>
    - hud-model, launching (OD-2, OD-3, PD-2): a `launching` state whose `rollRate` is `layout.stationRollRadPerSec` gives `bars.roll === 0` and `compass.blip === false`, with `compass.target` still resolved (for example "station" at the mouth).
    - hud-model, in flight: `bars.roll` stays `rollRate / maxRoll` (clamped) and `compass.blip === true`; a `docked` state gives `compass.blip === false`.
    - hud-model, `preRollHudState` (PD-1): for a docked Lave state and a pre-roll pose, the result has mode `launching`, `clockSeconds` = docked + 600, `speed` = `config.launchSpeed`, `pitchRate` 0, position = `dockMouthPosition(layout)`, orientation = the pose's; the input object is not written (`hashFlight` and a `structuredClone` taken before are equal after), and the result is a different object.
    - hud-model, boundary (PD-1): the model built from `preRollHudState` at the pose for view time `LAUNCH_PRE_ROLL_DURATION` equals the model built from a real `beginLaunch` copy in speed, speedText, clockText, condition ("yellow"), aegis ("dockingRange"), compass.blip (false), bars (roll 0, speed 0.5) and the static contacts' x/y within 1e-9.
    - draw (OD-2): `drawHud` with a planet-target compass and `blip: false` draws the compass ring and ticks but no blip shape (record `arc` calls: one ring arc at the compass centre, no blip arc); with `blip: true` the blip arc is drawn as before.
    - render-driver (OD-1): a `launching` session renders with `hudCanvas.hidden === false`, `data-launching` set, and the drawn model has `compass.blip === false` and `bars.roll === 0`; a docked pre-roll session renders with the HUD shown, `data-launching` set, and a drawn model with mode-launching values (speed = launch speed, clock = docked + 600, condition "yellow", aegis "dockingRange") while `ctx.core.state` keeps mode "docked" and its `hashFlight` is unchanged across the frame; a docked session with no pre-roll keeps the HUD hidden and draws no model.
    - render-driver hints (PD-3): over a docked frame, pre-roll frames and launching frames, no hint text is enqueued on the HUD message queue and `ctx.station.stationMessage` is not changed by a pre-roll or launching frame. Use the real `createHints` if the harness can host `ctx.runtime.hints`; otherwise a recording `maybeShow` that asserts the contexts carry the live modes ("docked" in the pre-roll, "launching" after).
  </behavior>
  <action>
Write the tests in the behaviour list first and run them red, then implement.

1. `src/render/hud/draw.ts` (OD-2): add `readonly blip: boolean` to `HudCompass` with a doc comment citing Oolite's
   `drawCompass:` launching guard (`HeadUpDisplay.m:1494` at 7437f22) and stating that the ring and ticks are always
   drawn. In `drawCompass`, after the ring and the four ticks, restore the context and return before the blip when
   `compass.blip` is false. Do not add any ASC target drawing; extend the `drawCompass` doc to say Wegolite has no ASC
   target line, so Oolite's `drawASCTarget:` launching guard (`:2756`) has nothing to hide.
2. `src/app/hud-model.ts` (OD-2, OD-3, PD-1, PD-2): in `buildCompass` set `blip: state.mode === "inFlight"`. In
   `buildBars` read the roll as 0 when `state.mode === "launching"` (doc: Oolite holds `flightRoll` at 0 while it shows
   the break pattern, `PlayerEntity.m:6469-6470`; presentation only, the sim's `rollRate` is the station rate per D-10).
   Export `preRollHudState(state, layout, config, dock, pose)` returning a `FlightState`: a shallow copy of `state`,
   `beginLaunch(copy, layout, config, dock)` applied to the copy (import it from `src/sim/flight/launch.ts`; it only
   reassigns top-level fields, so the live state's nested objects are shared but never written), then the copy's
   `position` and `orientation` set from `pose`. Its doc states PD-1 (why the launch start values, the accepted boundary
   changes). Update the `conditionOf` doc so it stays true (docked without a pre-roll is green and the HUD is hidden;
   the pre-roll draws the launch start state, yellow). Use `FlightPose` and `DockGeometry` types from their sim modules.
3. `src/app/session/render-driver.ts` (OD-1, OD-4, PD-1, PD-3): compute the pre-roll pose once (hoist it out of the
   camera block and reuse it for the camera) and build `hudState` as `preRollHudState(...)` with
   `ctx.core.dockGeometry` while pre-rolling, else the live state. Hide the HUD canvas only for a docked session that
   is not pre-rolling; a launching session and a pre-rolling session show it. Keep toggling `data-launching` for the
   whole launch view. Pass `hudState` to `buildHudModel` and use `hudState.position` for `hostilesNearPlayer`; keep the
   message clock, the countdown, `flashAlpha` and `showHint(currentState)` on the live state (PD-3; add a one-line
   comment saying hints read the live state on purpose). Rewrite the comment above the HUD visibility line: the HUD is
   drawn while launching and in the pre-roll as Oolite draws it while launching (`Universe.m:4718-4732`), with the
   compass blip and the roll handled in `buildHudModel`.
4. Update the HudModel literals in `tests/hud/cap-text.test.ts` and `tests/hud/clock-lines.test.ts` (add `blip: true`)
   so they typecheck. Rewrite the two render-driver tests that pin the hidden HUD (the l26 launching test and the os8
   pre-roll test): rename them to say the HUD is shown, keep their camera and station-angle assertions unchanged, and
   add the behaviour assertions. Add the "docked with no pre-roll keeps the HUD hidden" assertion to the existing
   data-launching test if it is not already pinned.

Do not edit any file under `src/sim`, `tests/golden` or `src/content/generated`, and do not edit `src/app/hints.ts`.
Run the targeted suite, typecheck and lint in local Docker, then commit Task 1 alone:
`feat(quick-261118-spu): draw the flight HUD through the launch pre-roll and the launch`.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/ui/hud-model.test.ts tests/hud/clock-lines.test.ts tests/hud/cap-text.test.ts tests/hud/projection.test.ts tests/app/session/render-driver.test.ts tests/app/redraw-gate.test.ts tests/app/session-order.test.ts</automated>
    <automated>docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>test "$(rg -c 'compass\.blip' src/render/hud/draw.ts || echo 0)" -ge 1   # [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(rg -c 'beginLaunch' src/app/hud-model.ts || echo 0)" -ge 1   # [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(rg -c '"launching"' src/app/hud-model.ts || echo 0)" -ge 1   # [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(rg -c 'const hudHidden = currentState.mode === "docked" \|\| launching;' src/app/session/render-driver.ts || echo 0)" -eq 0   # [HEAD=1 EXPECT==0]</automated>
    <automated>git diff --quiet 25010b6 -- src/sim tests/golden src/content/generated src/app/hints.ts   # exit status [HEAD=0 EXPECT==0 GUARD MUTATION: any edit under src/sim or to src/app/hints.ts turns it red]</automated>
  </verify>
  <done>The targeted Vitest files, typecheck and lint pass in local Docker; the model hides the compass blip and zeroes the roll bar while launching; the pre-roll HUD equals the launch-start HUD at the boundary; the live state's hash is unchanged by a pre-roll frame; the render driver shows the HUD in the pre-roll and the launch and hides it only for a plain docked session; Task 1 is committed.</done>
</task>

<task type="auto">
  <name>Task 2: Probe field, browser spec, records, remote gates and the frame capture</name>
  <files>src/app/probe.ts, src/app/session/probe-publisher.ts, src/main.ts, tests/fixtures/probe-shape.json, tests/e2e/launch.spec.ts, CHANGELOG.md, FIDELITY.md, .planning/PROJECT.md, .planning/todos/pending/2026-11-18-draw-the-hud-while-launching.md, .planning/todos/completed/2026-11-18-draw-the-hud-while-launching.md</files>
  <read_first>src/app/probe.ts (lines 40-75 and 630-645), src/app/session/probe-publisher.ts (lines 466-497), src/main.ts (lines 275-290), tests/e2e/probe-shape.spec.ts (lines 1-120: write mode and how keys are ordered), tests/fixtures/probe-shape.json (lines 15-30), tests/e2e/launch.spec.ts (whole), tests/contract/fidelity.test.ts (lines 40-60 and 190-275), FIDELITY.md (rows at lines 24, 113 and 131; excerpts E-08 and E-113 to E-115), .planning/PROJECT.md (line 322), CHANGELOG.md (lines 1-30), /tmp/os8-capture/os8-capture.spec.ts, .planning/quick/261118-os8-add-a-1-5-s-pre-roll-inside-the-dock-slo/261118-os8-PLAN.md (lines 455-500, the remote capture method)</read_first>
  <action>
1. Probe (PD-4): add `blip: boolean` to `WegoliteHudCompassProbe` in `src/app/probe.ts` (doc: false while launching
   and in the pre-roll, as Oolite skips the compass blip while launching) and `blip: false` to the default compass
   objects in `src/app/probe.ts` (around line 640) and `src/main.ts` (around line 282). In
   `src/app/session/probe-publisher.ts` publish `blip: model.compass.blip`, and `blip: false` in the no-model
   fallback. Hand-edit all seven `"compass"` objects in `tests/fixtures/probe-shape.json` to add `"blip": "boolean"`,
   placed in the key order the probe-shape writer produces (read the spec's shape walker first: the existing entries
   list `forward` before `target`).
2. Browser spec `tests/e2e/launch.spec.ts` (OD-1, OD-2): update the header comment (the HUD is now drawn through the
   launch view, compass blip absent, as Oolite draws it while launching). In the first-launch test: in the pre-roll
   assert `#hud` visible, `preRoll.hud.compass.blip` false, the HUD canvas has a non-zero backing store and box (reuse
   the handover check's evaluate), and the overlay title and status lines still hidden; while launching assert `#hud`
   visible and `during.hud.compass.blip` false, overlay lines still hidden; after handover wait on the probe until
   `hud.compass.blip` is true. Also compare `preRoll.hud.lift` with the handover `hud.lift` and expect them equal; if
   they differ, find the cause (for example a lift measured while the station shell was still laid out) and fix it in
   the render path, never by loosening the assertion. In the pause test, the assertion after `waitForMode(page,
   "launching")` becomes a visible-HUD assertion with an updated comment. Keep every clock, count, save-attempt and
   timing assertion unchanged.
3. Records:
   - `CHANGELOG.md` `## [Unreleased]` `### Changed`: one player-facing bullet: the flight HUD now shows during the
     launch from the docking slot, as in Oolite; until you leave the slot the compass shows no target and the roll
     indicator stays centred.
   - `.planning/PROJECT.md` line 322 (the l26/os8 Key Decisions row): replace the sentence saying the flight HUD stays
     hidden until handover with the spu outcome: since quick 261118-spu (owner decision 2026-11-18) the flight HUD is
     drawn through the pre-roll and the launch as Oolite draws it while launching; the compass blip is hidden (no ASC
     target line exists); the roll bar reads 0 while the hull keeps rolling with the station (D-10); the pre-roll HUD
     reads the launch start values (PD-1). Append to its check column the spu tests (the hud-model boundary test, the
     render-driver pre-roll test and the launch spec first-launch test). Keep the row's quoted decision title unchanged
     (FIDELITY rows quote it).
   - `FIDELITY.md`: keep each fidelity cell exactly `faithful` or `divergence: ...` (the contract test compares the
     cell literally). Amend the "Launch roll basis taken from the station" row (still a divergence for the hull) with
     the HUD roll bar at 0 while launching, faithful to E-08, plus OD-3's restore nuance. Amend the "Launch
     presentation" row to say the HUD is drawn through the pre-roll and the launch since quick 261118-spu. Amend the
     condition-light row so "green only while docked, where the flight HUD is hidden" stays true (the pre-roll draws
     the launch start state). Add faithful rows: (a) "Flight HUD drawn while launching (FLGT-05)" with the Wegolite
     cell at the render-driver HUD visibility line and the Oolite cell at the `Universe.m` HUD-status switch; (b)
     "Compass ring drawn, target blip hidden while launching; Wegolite draws no ASC target line (FLGT-05)" with the
     Wegolite cell at the `drawCompass` blip gate and the Oolite cell at the `HeadUpDisplay.m` launching guard, given
     as a range (the Oolite cell regex needs `start-end`); (c) "Roll bar at zero while launching (FLGT-05)" with the
     Wegolite cell at the `buildBars` roll line and E-08 reused (`src/Core/Entities/PlayerEntity.m:6469-6470`). Add the
     new excerpts as E-116 and E-117 after E-115, quoted verbatim from `git -C /home/opencode/git/oolite show
     7437f22:<path>` with ranges re-derived at 7437f22 (the checkout HEAD differs), each at most 20 lines and exactly
     its range. Every new or amended row names quick 261118-spu.
   - Close the todo: `git mv` it to `.planning/todos/completed/` and append a "Resolution" section (owner decision
     2026-11-18, quick 261118-spu, OD-1 to OD-3, PD-1).
4. Local Docker: the full `docker compose run --rm test`, `typecheck` and `lint`. Commit:
   `feat(quick-261118-spu): publish hud.compass.blip, pin the HUD in the launch spec, record the decision`.
5. Remote, one run at a time, on the committed HEAD:
   - The launch spec: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/launch.spec.ts --project=chromium"`.
   - The probe-shape write check: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm -e WEGOLITE_PROBE_SHAPE_WRITE=1 e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/probe-shape.spec.ts --project=chromium"`,
     then copy `~/wegolite-remote/tests/fixtures/probe-shape.json` from the remote to
     `/tmp/spu-capture/probe-shape.recorded.json` with `scp` and compare it with the committed fixture using
     `python3 -I` (equal after `json.load`, and equal `json.dumps` output so the key order matches too). On a mismatch,
     fix the hand edit, commit, and repeat. Never commit the raw recorded file (it is not Prettier-formatted).
   - The frame capture: copy `/tmp/os8-capture/os8-capture.spec.ts` to `/tmp/spu-capture/spu-capture.spec.ts` and
     adapt it (1280x720, real time on `/?test=1&traffic=1`, hold each frame with KeyP and hide the pause overlay as os8
     did) to capture: the pre-roll at `launch.preRollElapsed` >= 0.5, the launch at `launch.elapsed` >= 1.0, and the
     first in-flight frame after handover; if timing allows, also the last pre-roll frame and the first launch frame as
     a boundary pair. Record each frame's probe (`launch.*`, `mode`, `hud.compass`, `hud.aegis`, `hud.lift`) to
     `/scratch/out/capture.json`. `scp -r /tmp/spu-capture opencode@192.168.178.51:/tmp/`, run
     `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm -v /tmp/spu-capture:/scratch e2e sh -lc "cp /scratch/spu-capture.spec.ts tests/e2e/ && npm run build:e2e && npx playwright test tests/e2e/spu-capture.spec.ts --workers=1 --project=chromium"`,
     fetch `out/` into `/tmp/spu-capture/run1/`, and clean the remote copy with
     `ssh opencode@192.168.178.51 "docker run --rm -v /tmp/spu-capture:/w busybox:1.36 sh -c 'rm -rf /w/*'; rm -rf /tmp/spu-capture"`.
     Open every PNG with the Read tool and check: the HUD is drawn and laid out on the disclaimer as at handover; the
     compass ring has no blip in the pre-roll and launch frames and has one after handover; the roll bar is centred;
     the speed bar is at half; the aegis "S" and the yellow condition light show; the overlay version and system lines
     are hidden; the boundary pair shows no HUD value change other than the accepted ones in PD-1.
   - `verify-full` in the background: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify-full`;
     wait for its exit code. On a failure, fix, commit and rerun the failed stage, then `verify-full` again.
   The NPC acceptance run is not due (nothing under `src/sim/npc`, `src/sim/world` or `ships-npc.json` changes).
6. Write `.planning/quick/261118-spu-draw-the-hud-while-launching-as-oolite-d/261118-spu-SUMMARY.md`: decisions as
   implemented (OD-1 to OD-5, PD-1 to PD-4), the hints analysis, the frames table (frame, actual times, HUD, compass,
   roll, speed, aegis, condition, defects), the gates table with snapshots, and the protected-path diff result. No
   scratch file is tracked.
  </action>
  <verify>
    <automated>docker compose run --rm test && docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts tests/contract/readme.test.ts</automated>
    <automated>test "$(rg -c '"blip": "boolean"' tests/fixtures/probe-shape.json || echo 0)" -eq 7   # [HEAD=0 EXPECT==7]</automated>
    <automated>test "$(rg -c 'blip' src/app/probe.ts || echo 0)" -ge 2   # [HEAD=0 EXPECT>=2]</automated>
    <automated>test "$(rg -c 'blip' src/app/session/probe-publisher.ts || echo 0)" -ge 2   # [HEAD=0 EXPECT>=2]</automated>
    <automated>test "$(rg -c 'blip' src/main.ts || echo 0)" -ge 1   # [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(rg -c 'compass\.blip' tests/e2e/launch.spec.ts || echo 0)" -ge 3   # [HEAD=0 EXPECT>=3]</automated>
    <automated>test "$(rg -c 'locator\("#hud"\)\)\.toBeHidden' tests/e2e/launch.spec.ts || echo 0)" -eq 0   # [HEAD=3 EXPECT==0]</automated>
    <automated>test "$(rg -c 'The flight HUD stays hidden until handover' .planning/PROJECT.md || echo 0)" -eq 0   # [HEAD=1 EXPECT==0]</automated>
    <automated>test "$(rg -c '261118-spu' .planning/PROJECT.md || echo 0)" -ge 1   # [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(rg -c '261118-spu' FIDELITY.md || echo 0)" -ge 3   # [HEAD=0 EXPECT>=3]</automated>
    <automated>test "$(rg -c '^### E-11[67] ' FIDELITY.md || echo 0)" -eq 2   # [HEAD=0 EXPECT==2]</automated>
    <automated>test -f .planning/todos/completed/2026-11-18-draw-the-hud-while-launching.md   # [HEAD=absent EXPECT==present]</automated>
    <automated>test ! -f .planning/todos/pending/2026-11-18-draw-the-hud-while-launching.md   # [HEAD=present EXPECT==absent]</automated>
    <automated>test "$(ls /tmp/spu-capture/run1/*.png 2>/dev/null | wc -l)" -ge 3   # [HEAD=0 EXPECT>=3]</automated>
    <automated>git diff --quiet 25010b6 -- src/sim tests/golden src/content/generated src/app/hints.ts   # exit status [HEAD=0 EXPECT==0 GUARD MUTATION: any edit under src/sim or to src/app/hints.ts turns it red]</automated>
    <automated>L=$(git ls-files) && test "$(printf '%s\n' "$L" | rg -c 'spu-capture' || echo 0)" -eq 0   # stray scratch [HEAD=0 EXPECT==0 GUARD MUTATION: copying spu-capture.spec.ts into tests/e2e/ and adding it turns it red]</automated>
  </verify>
  <done>The full local suite, typecheck, lint and the fidelity contract pass in local Docker; on the remote the launch spec passes, the recorded probe-shape fixture is JSON-identical to the committed one, at least three captured frames have been looked at and match the checklist, and verify-full exits 0 on the final HEAD; PROJECT.md, FIDELITY.md and CHANGELOG.md record the change; the todo is in completed; the SUMMARY is written; no scratch file is tracked and no protected path changed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| render path -> live sim state | The render driver builds a presentation copy of the flight state; a write through it would change hashed sim state |
| repository <- /tmp scratch | The capture spec, the recorded fixture and the PNGs live under /tmp locally and on the remote |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261118-spu-01 | Tampering | `preRollHudState` (src/app/hud-model.ts) | medium | mitigate | `beginLaunch` runs on a shallow copy and only reassigns top-level fields; unit tests compare `hashFlight` and a `structuredClone` of the live state before and after, and the render-driver pre-roll test pins `ctx.core.state` mode and hash across a frame; the protected-path diff against 25010b6 stays empty |
| T-261118-spu-02 | Repudiation | tests/fixtures/probe-shape.json | low | mitigate | The hand edit is confirmed by a remote `WEGOLITE_PROBE_SHAPE_WRITE=1` recording compared with `python3 -I` (value and key order); the raw recorded file is never committed |
| T-261118-spu-03 | Tampering | repository contents (scratch capture) | low | mitigate | Scratch stays under /tmp; the Task 2 gate checks `git ls-files` for `spu-capture`; the remote copy is removed through a throwaway busybox container |
| T-261118-spu-04 | Information disclosure | `hud.compass.blip` probe field | low | accept | It mirrors what the HUD already draws; the probe carries no entity id or save data |
| T-261118-spu-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or upgraded by this plan; package.json and package-lock.json are not touched |
</threat_model>

<verification>
- Local Docker: full `test`, `typecheck`, `lint`; the fidelity contract.
- Remote (committed HEAD, one run at a time): the launch spec, the probe-shape write check, the frame capture (frames
  looked at), then `verify-full` exit 0.
- `git diff 25010b6 -- src/sim tests/golden src/content/generated src/app/hints.ts` is empty.
</verification>

<success_criteria>
- The HUD is visible and drawn in the pre-roll and the launch, with the compass ring but no blip and the roll bar at 0;
  the blip returns at handover; the overlay lines stay hidden.
- The last pre-roll frame and the first launch frame draw the same HUD values apart from the PD-1 accepted changes.
- No hint fires in the pre-roll or the launch that did not fire before.
- No sim file, hash or golden changed; remote `verify-full` passed on the final HEAD.
- PROJECT.md, FIDELITY.md, CHANGELOG.md and the todo record the decision.
</success_criteria>

<output>
Create `.planning/quick/261118-spu-draw-the-hud-while-launching-as-oolite-d/261118-spu-SUMMARY.md` when done
</output>
