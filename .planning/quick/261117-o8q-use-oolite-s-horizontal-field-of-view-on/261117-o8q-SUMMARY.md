---
phase: quick
plan: 261117-o8q
subsystem: render
status: complete
tags: [render, camera, fov, hud, scanner, fidelity]
requires: []
provides:
  - "One Oolite frustum rule (src/render/viewport.ts viewTangents/viewFovYDegrees) applied to every camera on install and resize"
  - "SceneManager.activeView() (gui for the title scene, flight otherwise)"
  - "HudModel.viewTanX feeding the scanner's forward-view lines"
affects: [src/render, src/app, HUD]
tech-stack:
  added: []
  patterns:
    - "viewport.ts is the only writer of camera.aspect and camera.fov"
key-files:
  created: []
  modified:
    - src/render/viewport.ts
    - src/render/system-scene.ts
    - src/render/menu-scene.ts
    - src/app/scene-manager.ts
    - src/main.ts
    - src/render/hud/draw.ts
    - src/app/hud-model.ts
    - src/app/session/render-driver.ts
    - tests/render/viewport.test.ts
    - tests/app/dispose.test.ts
    - tests/hud/projection.test.ts
    - tests/ui/hud-model.test.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/todos/pending/2026-11-17-ui-flight-hud-differences-from-oolite.md
decisions:
  - "The title (menu) camera uses Oolite's GUI branch of the frustum rule (ratio 0.5 inside a 4:3 box), because Oolite draws the intro Cobra with displayGUI = YES (Universe.m:2987)"
  - "Near and far planes stay at Wegolite's single pass (0.5 m, 2,500,000 m); Oolite's distanceFactor cancels out of the angular extent"
  - "No FOV game option (Oolite's 30-80 degree range); Wegolite uses the default fov-value 57.2 only"
  - "No PROJECT.md Key Decisions row: no row chose the vertical FOV; it came from v1.0 Phase 3 research Open Question 4 (archived, not edited)"
metrics:
  duration: "about 40 min of execution, plus about 10 min verify-full and the orchestrator's k1l fix"
  completed: 2026-11-17
estimate:
  tokens: 120000
  tasks: 3
actuals:
  tokens: 58000
  tasks: 3
  commits: 5
plan_head_before: 8f9b91c6bfa32237609afe454108bf3c405f350b
plan_head_after: 5371f330516236d5dafe0426508363eef42405c6
---

# Quick 261117-o8q: Oolite's horizontal field of view Summary

The forward view now follows Oolite's frustum rule. At 16:9 and other windows wider than 4:3, 57.2° spans the width. A narrower window keeps the vertical angle it has at 4:3. The title camera uses Oolite's GUI branch. At 1280x720 the Viper 1,500 m ahead now measures 40 px, the same as in Oolite. Before the change it measured 22 px.

## Oolite rule (checked in the local checkout and at the 7437f22 pin)

- `MyOpenGLView.m:1282-1290`: `_fov` holds the tangent of the half angle, `tan(value/2)`. `Universe.m:755` sets it from `fov-value`, which defaults to 57.2.
- `Universe.m:4385`: `aspect = height / width`, the inverse of Three's `camera.aspect`.
- `Universe.m:4445`: `ratio = (displayGUI ? 0.5 : fov) * near / distanceFactor`. The `distanceFactor` cancels out of the angles.
- `Universe.m:4448-4452`: in flight, when the window is at least 4:3 wide, x is `±ratio` and y is `±aspect·ratio`. Otherwise x is `±3·ratio/aspect/4` and y is `±3·ratio/4`. The GUI branches are the other way round. Both meet at 4:3.
- `Universe.m:2987`: the intro Cobra screen sets `displayGUI = YES`.
- `HeadUpDisplay.m:4002-4006`: the scanner's `tanfov` is `fov`, multiplied by `0.75·width/height` when the window is narrower than 4:3.

In Three terms, with A = width/height and f = tan(28.6°): in flight, x = f and y = f/A when A ≥ 4/3; otherwise y = 0.75f and x = 0.75fA. In the GUI view, x = 0.5 and y = 0.5/A when A ≤ 4/3; otherwise y = 0.375 and x = 0.375A. At 1280x720 the flight `camera.fov` is 34.1000° and the GUI one is 41.1121°.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | One Oolite frustum rule for every camera, on install and on resize (tracer) | `a6aa69a` |
| 2 | HUD overlays follow the same camera (scanner cone and ident frame) | `130d109` |
| 3 | Docs, remote gates and the Viper measurement | `f437f4c`, `5371f33` |

The orchestrator committed `e759fd2` (fix(quick-261117-k1l)) during Task 3; see Gates. It is counted in `commits: 5` because it lies inside the measured range.

## Projection consumer audit

| Consumer | Outcome |
| -------- | ------- |
| Flight camera (`system-scene.ts` `createCamera`, `enterSystem`, `main.ts` `resize`) | Constructed with `viewFovYDegrees(1, "flight")`. `applyViewport` writes `aspect` and `fov` on install and on resize, and `main.ts` passes `scenes.activeView()`. |
| Title camera (`menu-scene.ts`, `enterMenu`) | Constructed with `viewFovYDegrees(1, "gui")`. `enterMenu` applies the `gui` view, and `activeView()` returns `"gui"` while the menu is active. |
| Empty fallback camera (`scene-manager.ts`) | Uses the flight view, on install and in `enterMenu` before the preload. |
| Ident frame (`projection.ts` `projectIdentFrame`, `render-driver.ts` `identFrameFor`) | No code change; it already reads `live.fov` and `live.aspect`. A new test shows it matches `Vector3.project(camera)` at 1280x720, 1000x1000 and 2222x1000, within 1e-6 for both centre and half-size. |
| Scanner forward-view cone (`draw.ts` `drawScannerGrid`) | The fixed 57.2° constant is removed. `HudModel.viewTanX` comes from `viewTangents(viewAspect, "flight").x`, and `render-driver` passes `viewAspect: currentScene.camera.aspect`. An unusable aspect falls back to 1920/1080. |
| Laser ribbons (`laser-shots.ts:205`) | Read `projectionMatrix[1][1]`, so they follow the camera with no change. |
| Starfield, sun, corona, dust, crosshair, compass | No FOV input. |
| Writers of `camera.fov` / `camera.aspect` | Only `src/render/viewport.ts:126-127` (`rg "\.fov\s*=\|\.aspect\s*=" src`). |

## Tests that used the old FOV

- `tests/render/viewport.test.ts`: **updated.** The helper camera now uses `viewFovYDegrees(1, "flight")`. New tests cover the rule (16:9, 4:3 ± 1e-9, 1:1, 3:4, 2222x1000, the GUI cases and the RangeError cases) and that `applyViewport` writes `fov`. A rejected size leaves `fov` unchanged. A 10 m object 1,500 m ahead now spans 7.83 px at 1280x720, against 4.40 px with the old vertical 57.2°: exactly 16/9 more.
- `tests/app/dispose.test.ts`: **extended.** It checks `fov` and `activeView()` at installs 1 to 4: flight 37.6342°, GUI 41.1121°, flight, flight. The expected values come from the formulas in the test.
- `tests/hud/projection.test.ts:344-499`: **kept.** These tests pass 57.2 as the `fovY` argument of the pure projection math. They test the function, not the camera.
- `tests/app/session/render-driver.test.ts:264`: **kept.** A fake camera with `fov: 57.2` is only passed through.
- `tests/hud/projection.test.ts` and `tests/ui/hud-model.test.ts`: **new.** They add the ident-frame alignment check, the scanner cone check (outer points at the centre ± (ww·sin, hh·cos) of atan(viewTanX), narrower at 1:1 than at 16:9) and the `viewTanX` values and fallbacks.

## Visual measurement (remote, 1280x720, Desktop Chrome)

All three NPC images were measured by one script, `/tmp/o8q-fov/tools/measure.py`, with the same parameters: R=15, T=60, G=100, D=0, centre (640,360) and window (590,330)-(690,390). The plan's "brighter than the sky" rule did not work here, because the Viper sits in front of a planet. The script instead marks a pixel when it differs from the median of its 31x31 neighbourhood by more than 60. It excludes saturated HUD green and takes the 4-connected blob nearest the screen centre. I checked 4x masks with the Read tool: each blob is the ship, not the crosshair, the coastline or the laser.

| Image | Viper width |
| ----- | ----------- |
| Oolite `/tmp/ooref-ui/oolite/screenshots/08-npc.png` | **40 px** (x 620..659) |
| Wegolite before, `5a4e4cd` (`/tmp/ooref-ui/wegolite/npc.png`) | **22 px** (x 629..650) |
| Wegolite after, `e759fd2` (`/tmp/o8q-fov/wegolite/npc.png`) | **40 px** (x 620..659) |

- After vs Oolite: 1.00, within the 15 percent bar.
- After vs before: 1.82, inside the 1.6-1.95 bar. The expected value is 16/9 = 1.78; one pixel on 22 px gives 1.74-1.90.

**Title Cobra:** measured at 574 px wide (x 353..926, centre 639.5), so it is whole and centred. The screenshot is `/tmp/o8q-fov/wegolite/title-scene.png`. Measuring it needed two departures from the plan:

- **Script:** I used `/tmp/o8q-fov/tools/measure_sky.py`: brightest channel above 12 on the black sky, largest 8-connected blob. The width holds at 574 px for thresholds of 12 and below. The median rule only found an interior detail on the large ship.
- **Capture:** the menu scene is hidden by the opaque `#title-screen` overlay, and nothing redraws it after the preload swaps in the Cobra. The scratch test therefore hid the overlay and forced a resize to 1280x720 before the screenshot.

There is no Oolite title capture. The rule predicts the Cobra is 1.454 times its old width (f/0.375), so it was about 395 px before.

New screenshots, not committed:

- `/tmp/o8q-fov/wegolite/npc.png`
- `/tmp/o8q-fov/wegolite/title-scene.png`
- `/tmp/o8q-fov/wegolite/title.png`: the title screen as a player sees it, overlay on and no Cobra visible.

Capture runs: `exit=0 elapsed=18s snapshot=e759fd2` (npc and title), then `exit=0 elapsed=8s snapshot=e759fd2` (title-scene). Logs: `/tmp/o8q-fov/capture-run.log` and `capture-run-2.log`.

## Gates (remote, wrapper exit lines)

- `exit=0 elapsed=69s snapshot=f437f4c`: test (218 files; 5631 passed, 10 skipped)
- `exit=0 elapsed=26s snapshot=f437f4c`: lint
- `exit=0 elapsed=8s snapshot=f437f4c`: typecheck
- `exit=1 elapsed=596s snapshot=f437f4c`: verify-full, first run; 136 passed, 1 failed (`/tmp/o8q-fov/verify-full.log`)
- `exit=0 elapsed=622s snapshot=e759fd2`: **verify-full, recorded result**; 137 passed plus the 2-test seam step (`/tmp/o8q-fov/verify-full-2.log`)

**Why the first verify-full failed.** `tests/e2e/npc-flight.spec.ts:134` step 6 checks "the station flyer is closer to the station". It expected less than 3300.20 m and got 3539.95 m. This change did not cause it:

- The check is computed in Node by `runTickScript`, and the browser-hash step before it passed.
- `git diff 8f9b91c f437f4c -- src/sim src/content tests/helpers tests/e2e` is empty.
- A scratch Node replay (`/tmp/o8q-fov/repro/`) passes at `52d11ad^` (3300 m to 2592 m). It fails with exactly these numbers at `52d11ad` (quick task 261117-k1l, Coriolis radius 500 m to 779 m), at `8f9b91c` and at HEAD.

The orchestrator fixed the spec in `e759fd2`, with owner approval; it now asserts that the flyer ends nearer its goal range. The second verify-full ran on that commit.

Local Docker during the work: the targeted Vitest files for Tasks 1 and 2, typecheck, prettier, and the FIDELITY contract test. The contract test was run both normally (8 passed, 1 skipped) and in verbatim mode with `OOLITE_SRC` set to a `git archive 7437f22 src` tree (9 of 9 passed).

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 - Bug] A test assertion that was too strict**
- **Found during:** Task 1 GREEN.
- **Issue:** `camera.fov` was compared with 34.1 to 9 decimals, but 34.1000 is a 4-decimal reference value.
- **Fix:** compare with `2·atan(f·9/16)` to 9 decimals and with 34.1 to 4 decimals.
- **Commit:** `a6aa69a`.

**2. [Rule 3 - Blocking] The measurement method**
- **Found during:** Step C.
- **Issue:** the plan's brightness rule could not separate the Viper from the planet behind it.
- **Fix:** a local-median rule with one parameter set for all three NPC images, and a separate black-sky script for the title Cobra. Both are described above.

**3. [Rule 3 - Blocking] The title capture**
- **Found during:** Step C.
- **Issue:** the opaque title overlay, and no redraw after the preload swaps in the Cobra.
- **Fix:** the scratch spec hid the overlay and forced a resize before the screenshot.
- **Consequence:** in normal play the title Cobra can't be seen at all, so the CHANGELOG clause "looks about 1.45 times larger at 16:9" describes the camera, not anything a player sees today. I did not touch it. This is a candidate R-item for the UI todos.

**Remote cleanup not done:** a Claude Code safety check blocked the busybox removal of the remote scratch directory `/tmp/o8q-fov-wego` on `opencode@192.168.178.51`. It is still there, holding root-owned outputs and the scratch spec. Remove it by hand with `docker run --rm -v /tmp/o8q-fov-wego:/w busybox:1.36 sh -c 'rm -rf /w/*'; rm -rf /tmp/o8q-fov-wego`.

## Known Stubs

None.

## Threat Flags

None. The change adds no new network, auth, file or schema surface.

## Repository hygiene

- No scratch spec, screenshot, log or repro file entered the repository. `git diff --name-only 8f9b91c HEAD` finds no `png`, `log`, `steps` or `html` file and no capture spec.
- The scratch files are only under `/tmp/o8q-fov/` locally, plus the remote directory noted above.
- No PROJECT.md change was made; no Key Decisions row chose the vertical FOV.
- No NPC acceptance run was due: this task changed nothing under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`.

## Self-Check: PASSED

- All files and commits checked: `src/render/viewport.ts`, `FIDELITY.md` (E-90, E-91), `CHANGELOG.md`, the todo, and commits `a6aa69a`, `130d109`, `f437f4c` and `5371f33` are present on HEAD.
