---
phase: 13-views-lasers-and-shields
plan: 13
subsystem: render/app
tags: [views, camera, lasers, shots, ident, hud, cbt-04, cbt-05, input-01, d-03-pending]
status: complete
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-11 PlayerCombatState on ctx.core.combat (view, identTarget); 13-08 laserFired events with from, to and laserKind; 13-05 COBRA_VIEW_OFFSETS, toWegoliteLocal, LASER_SHOT_DURATION; 13-15 identTargetSnapshot; 13-12 HudModelOptions"
provides:
  - "VIEW_OFFSETS and computeViewCamera(position, orientation, view, shake?): the four Cobra view cameras; computeCockpitCamera is the fore case"
  - "createLaserShotLayer(): one LineSegments over a 32-shot pool (add, update, dispose), LASER_SHOT_COLORS, LASER_SHOT_POOL; SystemScene.shots"
  - "laserFired routed (dockFeedback subscriber) to scene.shots.add(from, to, laserKind, flightTime), no shooter id stored"
  - "projectIdentFrame, IdentFrame, IDENT_FRAME_MIN_HALF/MAX_HALF in src/render/hud/projection.ts"
  - "HudModel.identFrame and drawIdentFrame (four corner brackets, a recorded non-element drawing); HudModelOptions.identFrame"
affects: [13-14]
requirements-completed: [CBT-04, CBT-05, INPUT-01]
actuals:
  tokens: 17400
  tasks: 3
  commits: 3
plan_head_before: e1cbfbe3076a845dc9c0dc70257f6844cf5fa4f1
plan_head_after: afdff3bb68d22ac3df0fe692093b3dd6fdb0a695
tech-stack:
  added: []
  patterns:
    - "A render layer with a fixed preallocated pool, float64 world endpoints and a float32 camera-relative write each update, hidden when empty (no idle draw call)"
    - "A pure projection that maps NDC onto the letterboxed 16:9 HUD design space for a window of any aspect: half window height = max(width / aspect, height) / 2"
    - "A presentation event (laserFired) routed through the existing dockFeedback subscriber so EVENT_SUBSCRIBER_ORDER stays pinned"
key-files:
  created:
    - src/render/bodies/laser-shots.ts
    - tests/render/laser-shots.test.ts
  modified:
    - src/render/launch-camera.ts
    - src/render/system-scene.ts
    - src/render/hud/projection.ts
    - src/render/hud/draw.ts
    - src/app/hud-model.ts
    - src/app/session/render-driver.ts
    - src/app/session/event-router.ts
    - tests/render/launch-camera.test.ts
    - tests/hud/projection.test.ts
    - tests/ui/hud-model.test.ts
    - tests/app/session-order.test.ts
    - tests/app/dispose.test.ts
    - tests/app/session/render-driver.test.ts
    - CHANGELOG.md
key-decisions:
  - "The view camera is the ship orientation turned about its own up axis (aft pi, port +pi/2, starboard -pi/2) at the rotated Oolite view position; its forward equals laserFrame(q, view).forward for every view, so the camera and the laser on a facing always look the same way (A1, pinned by a test)."
  - "A shot is a thin line (A4), alive while 0 <= now - start < 0.09 s of flight time; a shot whose start lies in the future (a Load rewound the clock) is dropped, and an expired slot is freed for good."
  - "laserFired goes through the existing dockFeedback subscriber (renamed in the docs as the presentation-feedback subscriber) instead of a sixth subscriber, so the pinned dispatch order and the facade's subscriber record are unchanged; the routed table grows from 20 to 21 kinds."
  - "The ident frame projection uses the live camera pose, vertical fov in degrees and aspect, and the HUD design size. The HUD is a 16:9 design space letterboxed into a window the 3D view fills, so one half window height is max(width / aspect, height) / 2 design pixels, which keeps the frame on the ship on any window shape."
  - "D-03 and D-04 stay PENDING OWNER CONFIRMATION (see plans 13-12 and 13-15). The ident frame is a recorded non-element drawing: HUD_ELEMENTS and HUD_LAYOUT stay at eleven. Plan 13-14 records the Key Decisions row."
coverage:
  - id: D1
    description: "Pressing a view key changes what the camera shows: the fore, aft, port and starboard cameras sit at the Cobra's compiled Oolite view position and look along the facing (aft behind, port toward the ship's left, starboard toward its right), keeping the ship's up axis"
    requirement: CBT-04
    verification:
      - kind: unit
        ref: "tests/render/launch-camera.test.ts#view cameras (CBT-04, A1)"
        status: pass
      - kind: unit
        ref: "tests/render/launch-camera.test.ts#derives each offset from the compiled view_position_* with z negated"
        status: pass
    human_judgment: true
    rationale: "The camera maths is decided in Node; whether each view reads correctly on screen (mirroring, the camera inside the hull, the near plane at the side offsets) needs a human look in a real WebGL session."
  - id: D2
    description: "Each laserFired draws a shot from the mount to the hit point or full range for 0.09 s of flight time in the laser's Oolite colour (pulse red, beam yellow, mining blue, military magenta); with no active shot the layer is hidden and adds no draw call; 32 shots at most, the oldest overwritten, no per-shot allocation; segments written camera-relative"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/render/laser-shots.test.ts"
        status: pass
      - kind: unit
        ref: "tests/app/session-order.test.ts#laserFired reaches the scene's shot layer (CBT-05, A4)"
        status: pass
      - kind: unit
        ref: "tests/app/dispose.test.ts#owns the shot layer: exposes it, adds its root and disposes it, also when half built (CBT-05)"
        status: pass
    human_judgment: true
    rationale: "A 1-pixel line seen along the view axis may read as a dot or a short streak; its visibility, thickness and colour on a real display are a visual judgement that headless Chromium cannot make."
  - id: D3
    description: "While ident is locked a frame is drawn around the target (four corner brackets in the HUD colour); it is a non-element drawing (HUD_ELEMENTS stays eleven, no HUD_LAYOUT rectangle moves); it disappears when the target leaves the view, falls behind the camera or the lock is dropped"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/hud/projection.test.ts#projectIdentFrame (INPUT-01, D-03)"
        status: pass
      - kind: unit
        ref: "tests/hud/projection.test.ts#the ident frame drawing (D-03, a non-element drawing)"
        status: pass
      - kind: unit
        ref: "tests/ui/hud-model.test.ts#buildHudModel ident frame (INPUT-01, D-03)"
        status: pass
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts#renderFrame ident frame (INPUT-01, D-03)"
        status: pass
    human_judgment: true
    rationale: "The frame position is numerically pinned, but that it sits visibly on the ship in the rendered 3D view across window shapes is checked here only through the maths; a human look at a real WebGL frame is needed."
  - id: D4
    description: "The whole gate is green in Docker: lint, typecheck, the full unit suite and the fast verify gate with the Chromium smoke subset"
    verification:
      - kind: command
        ref: "docker compose run --rm verify (exit 0, 27 Chromium specs passed)"
        status: pass
      - kind: command
        ref: "docker compose run --rm test (168 files, 3568 tests passed, 2 skipped)"
        status: pass
    human_judgment: false
---

# Phase 13 Plan 13: Views, drawn laser shots and the ident frame Summary

**The player now sees the four cockpit views from the Cobra's Oolite view positions, every laser shot as a 0.09 s line in the laser's Oolite colour (one draw call, none when idle), and a corner-bracket frame around the ident-locked ship in the 3D view, all inside the unchanged eleven-element HUD.**

## Performance

- **Duration:** about 25 min wall clock (about 6 min of that is the `verify` gate in Docker)
- **Tasks:** 3 of 3
- **Files:** 16 touched (1 source and 1 test created, 14 modified)

## Accomplishments

- **Views (Task 1, tracer).** `VIEW_OFFSETS` is the compiled `view_position_*` through `toWegoliteLocal`; `computeViewCamera` places the camera at the ship-rotated offset and turns it about the ship's up axis by 0, pi, +pi/2 or -pi/2. `computeCockpitCamera` is the fore case (exactly equal, tested). The render driver calls `computeViewCamera(pose.position, pose.orientation, ctx.core.combat?.view ?? "fore", shake)` in flight; the launch cinematic is unchanged. Tests pin: port forward = minus the ship's right axis, starboard = right axis, aft = minus the ship's forward, up unchanged, forward equals `laserFrame(q, view).forward` for all four, the fore view equals the cockpit camera, and each offset equals the vendored `view_position_*` with z negated.
- **Shots (Task 2).** `createLaserShotLayer` is one `THREE.LineSegments` over a 32-slot ring with preallocated float32 position and colour buffers and float64 world endpoints; `update` compacts the live shots, writes them camera-relative (float64 subtraction before the float32 write), sets the draw range and hides the object when none is live. `add` skips a non-finite segment or time; `update` hides on a non-finite camera or clock. `SystemScene.shots` is created, added to the scene and disposed like `npcs`. `laserFired` reaches `ctx.core.scene?.shots.add(event.from, event.to, event.laserKind, flightTime)` with no shooter id; the render driver calls `shots.update(cameraWorld, flightTime)` each frame.
- **Ident frame (Task 3).** `projectIdentFrame` projects the snapshot position through the live camera pose, vertical fov and aspect into the 1920x1080 design space (null behind or on the camera plane, outside the window, or for any non-finite input; half-size = collision radius seen from its depth, clamped to 28..180 design pixels). `HudModel.identFrame` is drawn by `drawIdentFrame` as four corner brackets right after the crosshair; it is not in `HUD_ELEMENTS`. The render driver projects `identTargetSnapshot(ctx.core.combat, world)` through the pose of the current view.
- CHANGELOG `### Added`: one entry covering the four views and keys, the drawn shots and colours, the ident frame and the U and Q keys.

## Task Commits

1. **Task 1: Pressing 3 shows the port view (sim view to render camera)** - `3c76f1a` (feat)
2. **Task 2: Drawn laser shots** - `919af12` (feat)
3. **Task 3: The ident frame around the locked target** - `afdff3b` (feat)

The two `tdd="true"` tasks were written test first (Task 2's test file was run and failed on the missing module before the layer existed), then committed once per task with the implementation, as the plan's per-task commit contract says.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The routed event table is pinned, so routing `laserFired` changed the pins**
- **Found during:** Task 2
- **Issue:** `tests/app/session-order.test.ts` pins `EVENT_KIND_SUBSCRIBER` literally at 20 kinds and the plan's `event-router.ts` change routes a 21st (`laserFired`). The file is not in `files_modified`. `laserFired` is also in `RESERVED_EVENT_KINDS`, whose pass-through test dispatches it with no scene; that still passes (the handler reads the scene with `?.`).
- **Fix:** added `laserFired: ["dockFeedback"]` to the table, `ROUTED_EVENT_KINDS` and the literal pin, a fixture event, the counts (20 to 21, eighteen to nineteen single-subscriber kinds) and three new routing cases (adds from/to/kind/clock, never stores the shooter id, no throw without a scene).
- **Files modified:** `src/app/session/event-router.ts`, `tests/app/session-order.test.ts`
- **Commit:** `919af12`

**2. [Rule 3 - Blocking] A required `SystemScene.shots` part changed the scene doubles**
- **Found during:** Task 2
- **Issue:** `SystemSceneParts` and `SystemScene` now require `shots`, so `tests/app/dispose.test.ts` (parts literal) and the `flyableScene` double in `tests/app/session/render-driver.test.ts` no longer typechecked or ran. Neither file is in `files_modified`.
- **Fix:** the dispose test builds a real shot layer, counts its geometry and material disposals in the scene-owned set and gains an ownership/half-built case mirroring the NPC one; the render-driver double gets a `shots.update` no-op.
- **Files modified:** `tests/app/dispose.test.ts`, `tests/app/session/render-driver.test.ts`
- **Commit:** `919af12`

**3. [Rule 2 - Missing] The render-driver wiring of the ident frame had no test in the listed files**
- **Found during:** Task 3
- **Issue:** the plan's tests cover the projection, the model passthrough and the draw only; nothing proved the driver projects through the current view's pose, drops the frame behind the camera, without a lock, without a combat state or without a world.
- **Fix:** five cases in `tests/app/session/render-driver.test.ts` (dead ahead near the sights, behind the camera, lock dropped, aft view sees a ship behind and the fore view does not, no combat state or no world). The camera double gained `fov: 57.2`.
- **Commit:** `afdff3b`

**4. [Rule 1 - Format] Prettier**
- **Found during:** Tasks 1 to 3
- **Fix:** ran Prettier in the lint container on the changed files before each commit.

**Total deviations:** 4 auto-fixed (2 blocking, 1 missing, 1 format). **Impact:** none on the plan's contract; the added test files are all under `tests/`.

## Verification

- `docker compose run --rm test npx vitest run tests/render/ tests/hud/ tests/ui/`: 30 files, 434 tests passed.
- `docker compose run --rm test` (full suite): 168 files, 3568 tests passed, 2 skipped. This includes `tests/compliance.test.ts` (SPDX headers on both new files).
- `docker compose run --rm lint`, `docker compose run --rm typecheck`: clean.
- `docker compose run --rm verify`: exit 0 (27 Chromium specs passed).
- Acceptance: `computeViewCamera` in `launch-camera.ts` 3 and in `render-driver.ts` 2; `src/render/bodies/laser-shots.ts` exists; `export function projectIdentFrame` in `projection.ts` 1; `identFrame` in `draw.ts` 2.
- `tests/golden/flight-hash-pins.json` was not touched and no golden was regenerated.
- Tracer gate: Task 1's `<verify>` is automated-only; it was re-run end to end (view-camera tests, render tests, typecheck, lint) before Task 2, and `verify` ran at the end.

## What is covered by unit tests only, and what needs a human look

Real WebGL visuals cannot be seen in the headless run. Covered by Node unit tests only (numeric and structural, no pixels):

- The camera orientations and offsets of the four views, and that each view looks where its laser fires.
- The shot layer's lifetime, colour per kind, pool and overwrite behaviour, camera-relative buffer values, visibility and disposal.
- The ident frame's projection, clamp, null cases and the bracket drawing (recorded canvas calls).
- The wiring: the render driver passes the live `combat.view` to the camera, calls `shots.update`, and routes `laserFired`; the Chromium smoke specs in `verify` boot, launch and fly but assert no pixels of any of these.

Needs a human look in a real browser session (none of these is asserted anywhere):

- Each of the four views reads correctly on screen: not mirrored, the camera at the side and aft offsets not clipping into the Cobra's hull or the near plane (the ship mesh is hidden in flight), the HUD crosshair still sensible on the side views.
- A shot is visible enough: it is a 1-pixel `LineBasicMaterial` line (A4); fore shots run along the view axis and may read as a dot or short streak, and the colour (linear 0 or 1 per channel, tone mapping off) should read as red, yellow, blue and magenta.
- The ident frame sits on the ship, in the view you look along, on a 16:9 window and on a wider or narrower one (the letterbox maths is proved numerically; the on-screen result is not).

## Owner decisions pending

D-03 (name-only lock message, plan 13-12) and D-04 (R while locked clears and re-acquires, plan 13-15) remain **PENDING OWNER CONFIRMATION**. This plan does not touch either; the ident frame drawing is independent of the message wording. The frame itself follows D-03's "a frame around the target" and is a recorded non-element drawing (`HUD_ELEMENTS` stays 11); plan 13-14 records the Key Decisions row.

## Known Stubs

None added. The `thargoid` entry of `LASER_SHOT_COLORS` (green, `equipment.plist` `EQ_WEAPON_THARGOID_LASER`) exists because `LaserKind` includes it; no stock record emits it.

## Threat Flags

None. T-13-26 is mitigated: `projectIdentFrame` returns null on any non-finite or unusable input, the shot layer skips a non-finite segment, time, camera or clock, and the pool is fixed with no per-shot allocation.

## Self-Check: PASSED

- Commits `3c76f1a`, `919af12` and `afdff3b` are ancestors of HEAD; the commit count since the plan ledger (`e1cbfbe`) is 3.
- `src/render/bodies/laser-shots.ts` and `tests/render/laser-shots.test.ts` exist and are committed; every other listed file is committed.
