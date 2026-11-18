---
phase: quick
plan: 261118-mb5
subsystem: sim/flight launch, sim/dock corridor
tags: [launch, docking, fidelity, FLGT-01, DOCK-01]
status: complete
requires: [quick 261118-l26 launch view]
provides: [launchOrientation, slotTwistedForShip, baselineLaunchPose]
affects: [launch pose, launch view, departure corridor class, session world hash]
tech-stack:
  added: []
  patterns: [data-driven Oolite predicate shared by launch and docking]
key-files:
  created: []
  modified:
    - src/sim/flight/launch.ts
    - src/sim/flight/step.ts
    - src/sim/dock/corridor.ts
    - tests/sim/launch.test.ts
    - tests/render/launch-camera.test.ts
    - tests/helpers/recorded-flights.ts
    - tests/sim/dock-capture.test.ts
    - tests/sim/dock-integrated.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/e2e/combat.spec.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
decisions:
  - "Launch the ship along the dock slot with Oolite's 90 degree launch twist (DockEntity.m:819-827); supersedes 'Leave the Phase 3 launch orientation untouched'"
  - "The predicate slotTwistedForShip lives in src/sim/dock/corridor.ts (no layering guard objected), shared by apertureHalfExtents and launchOrientation"
  - "The frozen v1 flight-hash golden stays byte-identical; the recorded flights restore the untwisted pose on the launch step (baselineLaunchPose)"
metrics:
  duration: approx. 75 min
  completed: 2026-11-18
actuals:
  tokens: 15000
  tasks: 2
  commits: 2
plan_head_before: 6bb5d3d6204656b30e9926308834b2c8e4b6b1a9
plan_head_after: 67eeb634ca7d8ff6519109422724d9efcf4b17c8
---

# Quick 261118-mb5: Launch the ship along the dock slot Summary

The Cobra now leaves the Coriolis with Oolite's launch twist (`DockEntity.m:819-827` at 7437f22). The pose is
`stationBaseQuat * axisAngle(0,0,1,-pi/2)`, which puts the wings along the slot's long axis. A data-driven
`slotTwistedForShip` predicate decides it from `DockGeometry.port` and `DockGeometry.ship`, the D-10 roll is unchanged,
and the departure is now in the docking lane.

## What changed

- `src/sim/dock/corridor.ts`: new exported `slotTwistedForShip(port, ship)`, true when exactly one of
  `port.width < port.height` and `ship.width < ship.height` holds. Its doc comment cites `DockEntity.m:565`, `:635-637`
  and `:824`. `apertureHalfExtents` now calls it (`rotationsMatch = !slotTwistedForShip(...)`), a refactor with no
  behaviour change: `dock-corridor.test.ts` and the generated corridor `ww 51.70615 / hh 120.944` checks stay green.
  The header and step-3 comments now say the nose gate keeps any wings-across pose outside the station, and that the
  launch pose is in the lane. No layering guard objected to `src/sim/flight` importing this module, so the predicate
  stays here.
- `src/sim/flight/launch.ts`: new exported `launchOrientation(layout, dock)`, with the sign derivation (conjugate
  convention, right-multiply, identity check, the z-mirror commuting with the twist), the axis mapping and the Oolite
  line references in its doc comment. `beginLaunch` gains `dock: DockGeometry | undefined`, and the module header
  describes the twist and that the D-10 roll commutes with it. `stepLaunch` and `completeLaunch` are unchanged. No code
  line holds a station or ship number (the regression guard printed nothing).
- `src/sim/flight/step.ts`: `beginLaunch(state, layout, config, options?.dock)`.
- Production path: `src/app/session/start-session.ts:485` sets `ctx.core.dockGeometry = createDockGeometry(...)` in
  construction step 6, and a failure there shows the boot failure and returns. The game loop starts at step 12, and
  `src/app/session/sim-driver.ts:135` passes `dock: ctx.core.dockGeometry` into every step. `dockGeometry` has no other
  writer (one assignment in `src/app`). No production launch can run without the geometry.
- Docked pose, the sanitizer repair and the save format are unchanged (`stationBaseQuat`; `beginLaunch` overwrites it).

## Re-pinned values and their causes

| Pin | Old | New | Cause | Revert check |
| --- | --- | --- | --- | --- |
| `tests/sim/dock-capture.test.ts` "does not self-dock a natural launch…": departure class at ~350 m | `outside` | `lane` | The launch twist puts the wings along the slot, so the departing box fits the corridor | With `beginLaunch(..., undefined)` in step.ts the test asserted `lane` and got `outside` again |
| `tests/app/session/tick-parity.test.ts` `HASH_60_AFTER_KILL` (debris twin) | `ca59f800` | `34393ce1` | The twin launches with the session's dock geometry, and the world hash includes the player orientation | With `beginLaunch(..., undefined)` the test passed on the old `ca59f800` |
| `tests/e2e/combat.spec.ts` `TWIN_HASH_60_AFTER_KILL` (browser twin) | `ca59f800` | `34393ce1` | Same as the Node twin | Confirmed in the browser by the remote verify-full (below) |

The first full local suite (after the twist, before any re-pin) failed only in `dock-capture`, `tick-parity` (the debris
twin), `flight-hash-pins` (two tests) and `hash.test` (the golden comparison), and each of these passes through a launch.
No pin moved without passing through a launch. The FIDELITY line references that shifted because of the new code were
updated in the Task 1 commit: E-08 `launch.ts:58 -> :116` (`state.rollRate = layout.stationRollRadPerSec`), E-11
`corridor.ts:325 -> :344` (the symmetric y guard comment) and the hyperspace-cancel row `step.ts:227 -> :230`.

## Frozen golden (`tests/golden/world/flight-hash-pins.json`)

- The file is byte-identical to `6bb5d3d`: the guard
  `git diff --name-only 6bb5d3d -- tests/golden src/content/generated src/sim/npc src/sim/world` is empty.
- `baselineLaunchPose` in `tests/helpers/recorded-flights.ts` resets `state.orientation = layout.stationBaseQuat` inside
  `Recorder.step` when the events contain `launched`, after the step and before the sample visit.
- Mutation: with the call removed, `tests/sim/world/flight-hash-pins.test.ts` fails "reproduces the committed golden
  exactly" and "holds when replayed through stepSim…". With it restored, `flight-hash-pins.test.ts` and `hash.test.ts`
  pass (2 files). The run before the helper existed was red in the same way, and `hash.test` "equals hashFlight and the
  pinned golden on every recorded sample" failed too.

## Mutation evidence

- Twist sign flipped (`+Math.PI / 2`): four tests go red. They are the axis mapping (`|+X - (-j)| = 2`), the steady
  twisted pose (step 0 off by pi), the data-driven rule test and the launch-view test (camera +X off by 2). The file was
  restored and the original line checked.
- Twist removed (`beginLaunch(..., undefined)` in step.ts): the axis, steady-pose, lane and launch-view tests go red,
  and the old pins return (above). Restored and checked (`rg -c` = 1).
- Nose gate removed (`if (inBand)` in `classifyCorridor`): `tests/sim/dock-integrated.test.ts` stays green. Five
  `tests/sim/dock-corridor.test.ts` tests go red, among them "safety band and straddle > classifies a wings-across
  straddle only with min.z < 0; at 500 m out it is outside" and "produces no event for a 500 m wings-across pose". The
  file was restored byte-identical (`cmp`). The dock-integrated header no longer claims to guard the gate; it now names
  those two dock-corridor tests.

## Docking finding

Docking is unchanged and still Oolite's (`DockEntity.m:631-653`): the corridor is `ww` along i and `hh` along j, and a
ship is in the lane only with its wings along j. After the natural 240-step launch with the geometry, the new test
"leaves the station already in the docking lane…" shows `classifyCorridor` = `lane`, with no scrape, bounce or dock. A
launched player no longer has to roll 90 degrees to fly straight back in.

## NPC launches and the acceptance run

No NPC launches from a station (`src/sim/world/populate.ts:17-18` and `src/sim/npc/proximity.ts:33`). `git diff
--name-only 6bb5d3d HEAD` lists no file under `src/sim/npc/**`, `src/sim/world/**` or
`src/content/generated/ships-npc.json`, so the NPC acceptance run is not due.

## Records

- FIDELITY.md: a new Mechanics row "Launch orientation: rolled 90 degrees about the launch axis when the dock port and
  the ship lie differently (FLGT-01)", `src/sim/flight/launch.ts:83`, `src/Core/Entities/DockEntity.m:819-827`,
  `faithful`, `E-114`. The excerpt `### E-114 src/Core/Entities/DockEntity.m:819-827` is copied verbatim from
  `git show 7437f22:`. The fidelity contract against the pin
  (`OOLITE_SRC=/oolite … tests/contract/fidelity.test.ts`) passed 9 tests with none skipped.
- PROJECT.md: the row "Leave the Phase 3 launch orientation untouched" now ends "Superseded by quick 261118-mb5
  (2026-11-18)", and a new Key Decisions row records the twist, its data source, sign, D-10, docking and the golden.
  D-10's own row needs no amendment: the launch roll is still about the local nose axis at the station's world rate, and
  the twist commutes with it.
- CHANGELOG.md `[Unreleased]` has a new `### Fixed` group before `### Changed`.

## Launch frames (remote, snapshot 67eeb63)

Frames are in `/tmp/mb5-capture/run1/`: `t0.0.png`, `t0.2.png`, `t0.8.png`, `t1.4.png`, `t1.9.png`, `handover.png`
and `capture.json`. The page logged no console errors, `shipVisible` is false and `hudHidden` is true while launching.
The t0.0 orientation `(0.5712, -0.0600, -0.5864, -0.5712)` equals l26's `stationBaseQuat (0.8078, -0.4570, -0.3722,
0)` times `axisAngle(z, -pi/2)`, checked by hand.

Expected before the capture: at 1280x720 the flight view's half-angle tangents are 0.545 horizontally and 0.307
vertically (`OOLITE_FOV_DEGREES` 57.2 across the width, `src/render/viewport.ts`). At t0.0 the camera is 200 m inside
the mouth and 7.25 m toward port +i. The slot's long half-extent (120.9 m) is at tan 0.605, outside the width. The
short edges are at tan 0.222 (top) and 0.295 (bottom), so only the top and bottom long walls are in view, and the top
band is thicker.

| Frame | Walls visible | Opening | Lit wall | Defects | Cobra/HUD |
| --- | --- | --- | --- | --- | --- |
| t0.0 | Top long wall (thick band) and bottom long wall (thin, partly under the page footer); no side walls, only the chamfered rim ends at the far left and right | Wide octagon, long side horizontal, about 1260 x 500 px, planet and stars through it | Top (bright) | No z-fighting, holes or clipped walls seen | Neither shows |
| t0.2 | Top long wall (narrower band) and the bottom rim just under the footer; the rim's long ends are past the frame sides | Fills almost the whole frame, wide | Top | None | Neither shows |
| t0.8 | None, clear of the mouth | Planet fills the view, star streaks | n/a | None | Neither shows |
| t1.4 | None | Planet, slow roll with the station | n/a | None | Neither shows |
| t1.9 | None | Planet | n/a | None | Neither shows |
| handover | None | Continues t1.9 with no jump (same framing, a small roll) | n/a | None | HUD and first-use hints appear, as expected at handover |

Against l26's `run1/t0.0.png` (a tall slot, the left and right side walls filling the frame sides), the slot now reads
wide, with the long side horizontal. The page footer (version, links and disclaimer) shows during the launch in both
runs. It is the l26 behaviour and out of scope here.

## Gates

- Local Docker: targeted Vitest (launch, launch-camera, dock-capture, dock-integrated, dock-corridor, flight-hash-pins,
  hash, tick-parity) passed. Full `docker compose run --rm test`: 221 files, 5821 passed and 10 skipped.
  `typecheck` and `lint` (ESLint plus Prettier) exit 0.
- Plan grep checks: `launchOrientation(` 2, the `beginLaunch(... options?.dock)` call 1, `slotTwistedForShip(` 2 in
  corridor.ts and 1 in launch.ts, `baselineLaunchPose` 2, Unreleased `### Fixed` 1, the protected-paths guard empty
  and the no-number guard 0.
- Remote frame capture: exit 0, snapshot 67eeb63.
- Remote verify-full on snapshot 67eeb63 (final committed HEAD): exit 0 in 671 s. Unit: 221 files, 5821 passed
  and 10 skipped. Chromium e2e: 140 passed. The final step: 2 passed. The browser twin
  `TWIN_HASH_60_AFTER_KILL` = `34393ce1` passed in `tests/e2e/combat.spec.ts`.

## Deviations from Plan

1. **[Rule 1 - Bug] The FIDELITY line references followed the shifted lines** (Task 1, commit 2bcb85e). The new code
   moved three cited lines, so rows E-08, E-11 and the hyperspace-cancel row pointed at the wrong lines. The contract
   only checks that a line is in range, so it would not have caught this. They were fixed in the same commit as the
   code that moved them.
2. **Test bound:** the new "reads the rule from the dock geometry" test compares quaternions through `acos`, which
   resolves only about 3e-8 rad near 1. It uses the file's existing 1e-6 slot bound instead of 1e-9. The axis-mapping
   test keeps 1e-9 on vectors.

## Known Stubs

None.

## Self-Check: PASSED
