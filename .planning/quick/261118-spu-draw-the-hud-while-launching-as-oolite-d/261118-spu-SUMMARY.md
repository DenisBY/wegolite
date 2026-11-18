---
phase: quick
plan: 261118-spu
subsystem: render/hud
status: complete
tags: [hud, launch, fidelity, FLGT-01, FLGT-05]
requires: [quick-261118-l26, quick-261118-os8]
provides:
  - flight HUD drawn through the launch pre-roll and the launch
  - HudCompass.blip and the hud.compass.blip probe field
  - preRollHudState (launch start values on a presentation copy)
affects: [src/app/session/render-driver.ts, src/app/hud-model.ts, src/render/hud/draw.ts]
tech-stack:
  added: []
  patterns: [presentation copy of sim state through the sim's own transition function]
key-files:
  created: []
  modified:
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
    - .planning/todos/completed/2026-11-18-draw-the-hud-while-launching.md
decisions:
  - "The flight HUD is drawn through the launch pre-roll and the launch, as Oolite draws it while launching (Universe.m:4718-4733); compass blip hidden, roll bar 0 (quick 261118-spu)"
  - "The pre-roll HUD reads the launch start values through preRollHudState (beginLaunch on a shallow copy); the live sim state is never written (quick 261118-spu, PD-1)"
metrics:
  duration: ~75 min
  completed: 2026-11-18
estimate:
  tokens: 70000
  tasks: 2
actuals:
  tokens: 10000
  tasks: 2
  commits: 2
plan_head_before: 25010b61cf0d4121cf040c423bf505ce0eb89c5a
plan_head_after: ce49c5d
---

# Quick 261118-spu: Draw the HUD while launching, as Oolite does

The flight HUD is now drawn through the 1.5 s launch pre-roll and the 2 s launch, with the compass ring but no target
blip and the roll bar at 0; the pre-roll HUD reads the launch start values from a presentation copy built by
`beginLaunch`, so no HUD value jumps at the pre-roll to launch boundary. Presentation only: no sim, hash or golden moved.

## Commits

| Task | Commit  | Message |
| ---- | ------- | ------- |
| 1    | 86c12c6 | feat(quick-261118-spu): draw the flight HUD through the launch pre-roll and the launch |
| 2    | ce49c5d | feat(quick-261118-spu): publish hud.compass.blip, pin the HUD in the launch spec, record the decision |

## Decisions as implemented

- **OD-1** `render-driver.ts`: `hudHidden = mode === "docked" && !preRolling`; `data-launching` still toggled for the
  whole launch view, so the overlay version and system lines stay hidden (confirmed in every captured frame).
- **OD-2 / PD-2** `buildCompass` sets `blip: state.mode === "inFlight"`; `drawCompass` draws ring and ticks, then
  restores and returns when `blip` is false. The target is still resolved and published. No ASC target line exists,
  documented in the `drawCompass` doc.
- **OD-3** `buildBars` reads the roll as 0 while `launching`; the sim's `rollRate` stays the station rate (D-10).
  FIDELITY records Oolite's late restore nuance.
- **OD-4** everything else as in flight (scanner, bars, message rows, condition, aegis).
- **OD-5** `git diff 25010b6 -- src/sim tests/golden src/content/generated src/app/hints.ts` is empty; no hash or
  golden test moved (full suite green).
- **PD-1** `preRollHudState(state, layout, config, dock, pose)`: `{...state}`, `beginLaunch(copy, ...)`, then the
  pre-roll pose. The render driver hoists the pre-roll pose once and reuses it for the camera and the HUD;
  `hostilesNearPlayer` reads `hudState.position`; message clock, countdown, `flashAlpha` and hints stay on the live state.
  The probe's `clock`/`mode` stay the sim's (docked, unchanged), so the os8 e2e pre-roll assertions still hold.
- **PD-3** hints unchanged; `showHint(currentState)` keeps the live state (comment added). Render-driver test with the
  real `createHintController`: the docked frame announces the launch hint on the station line, then pre-roll frames
  and 120 launching frames enqueue nothing and leave `stationMessage` unchanged.
- **PD-4** `hud.compass.blip` added to the probe type, both defaults, the publisher (model and no-model fallback) and
  all seven fixture `compass` entries (`blip` sorts before `forward`).

## Gates

| Gate | Where | Snapshot | Result |
| ---- | ----- | -------- | ------ |
| Targeted Vitest (7 files, 236 tests) | local Docker | Task 1 tree | pass; 8 new tests run red against the base src first |
| Full Vitest (221 files, 5865 passed, 10 skipped) | local Docker | Task 2 tree | pass (includes fidelity and readme contracts) |
| typecheck, lint | local Docker | both tasks | pass |
| `tests/e2e/launch.spec.ts --project=chromium` | remote | ce49c5d | 4/4 pass (incl. `preRoll.hud.lift === after.hud.lift`) |
| probe-shape write (`WEGOLITE_PROBE_SHAPE_WRITE=1`) | remote | ce49c5d | 7/7 pass; recorded fixture JSON-equal and key-order-equal to the committed one (`python3 -I`) |
| Frame capture (two runs) | remote | ce49c5d | pass, no console errors |
| verify-full | remote | ce49c5d | exit 0 in 849 s (lint, typecheck, content drift, 5865 unit tests, build, full Chromium e2e) |

The NPC acceptance run was not due (nothing under `src/sim/npc`, `src/sim/world` or `ships-npc.json` changed).

## Frames

Captured at 1280x720, real time on `/?test=1&traffic=1`, each held with KeyP and the pause overlay hidden. Files under
`/tmp/spu-capture/run1/` and `/tmp/spu-capture/run2/` (with `capture.json`). All frames looked at.

| Frame | Times | HUD | Compass | Roll | Speed | Aegis | Condition | Defects |
| ----- | ----- | --- | ------- | ---- | ----- | ----- | --------- | ------- |
| run1/s1-pre0.50.png | docked, preRollElapsed 0.558 | drawn, on the disclaimer (lift 92.37) | ring + ticks, no blip | centred | half | S | yellow | none |
| run1/s2-pre-last.png | launching 0.025 (predicate overshot) | drawn | no blip | centred | half | S | yellow | none |
| run1/s3-launch-first.png | launching 0.117 | drawn | no blip | centred | half | S | yellow | none |
| run1/s4-launch1.00.png | launching 1.05 | drawn | no blip | centred | half | S | yellow | none |
| run1/s5-handover.png | inFlight, elapsed 2 | drawn | blip back (station, behind) | centred | half | S | yellow | none |
| run2/s2-pre-last.png | docked, preRollElapsed 1.408 | drawn | no blip | centred | half | S | yellow | none |
| run2/s3-launch-first.png | launching 0.133 | drawn | no blip | centred | half | S | yellow | none |

Boundary pair (run2 s2 vs s3): same speed bar and text, roll, compass, aegis, condition, gauges and clock date (the
clock second ticks from :23 to :24 as 0.13 s of flight time passes over the +600 s start, as expected). The only
changes are the accepted PD-1 ones: the "Launching — stand by" row appears at the launch step, and the dust (not HUD)
starts. Overlay version and system lines hidden in every frame; lift 92.37 in every frame.

## Deviations from Plan

1. **[Rule 2 - test robustness] Pre-roll HUD wait in the launch spec.** After `waitForPreRoll` the first test also
   waits until `hud.aegis === "dockingRange"` while still pre-rolling, so the snapshot is from a frame that drew the
   HUD (before the press no HUD model exists and the probe's aegis reads "none"); this also makes the
   `compass.blip === false` assertion non-vacuous. Commit ce49c5d.
2. **[Rule 1 - stale citations] FIDELITY.md `src/render/hud/draw.ts:413` and `:476`** shifted by the 8 inserted
   `HudCompass.blip` lines; moved to `:421` and `:484` so they keep pointing at the same code. Commit ce49c5d.
3. **E-116 range** is `src/Core/Universe.m:4718-4733` (the plan text said 4718-4732): 4733 closes the
   `switch (v_status)` block at 7437f22, so the excerpt is the whole switch. PROJECT.md cites 4718-4732 as in the plan
   wording for the render path.
4. TDD order: the tests were written with the implementation, then run red against the base src (by restoring the
   three src files from HEAD for one run): 8 new tests failed, then passed with the change restored.

## Known Stubs

None.

## Self-Check: PASSED

- Files exist: `src/app/hud-model.ts` (preRollHudState), `src/render/hud/draw.ts` (blip gate),
  `.planning/todos/completed/2026-11-18-draw-the-hud-while-launching.md`; pending copy absent.
- Commits 86c12c6 and ce49c5d are ancestors of HEAD.
- `git ls-files | rg spu-capture` is empty; protected-path diff against 25010b6 is empty.
