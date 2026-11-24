---
phase: 20-player-death-and-game-over
plan: 12
subsystem: render
tags: [death, dead-camera, dust, redraw, fidelity, gap-closure]
requires:
  - phase: 20-player-death-and-game-over
    provides: "plans 20-04, 20-08, 20-11: the dead view, the effect clock and the debris drift"
provides:
  - "DEAD_COAST_SPEED_MPS and the coasting dead camera (Oolite's 160 m/s, looking aft)"
  - "dead dust arguments that never draw the frozen death speed's random-axis streaks"
  - "the dead view drawn every frame while shown (D-01e)"
  - "FIDELITY E-181, the revised E-179 row and the PROJECT.md DIV-7 decision"
affects: [20-13]
tech-stack:
  added: []
  patterns: ["render-only presentation clock for the dead camera; locals only, nothing written to the sim"]
key-files:
  created: []
  modified:
    - src/app/session/render-driver.ts
    - tests/app/session/render-driver.test.ts
    - tests/app/redraw-gate.test.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/PROJECT.md
    - .planning/phases/20-player-death-and-game-over/20-SECURITY.md
key-decisions:
  - "D-01e (owner 2026-11-24): the dead camera coasts at 160 m/s along the ship's forward axis, render-only, with no distance cap; the dead view draws every frame while shown"
  - "Torus factor 1 for the dead dust is a Wegolite choice (Oolite keeps stale warp lines after a hyperspeed death)"
requirements-completed: [DEATH-01]
status: complete
duration: 1h
completed: 2026-11-24
actuals:
  tokens: 70000
  tasks: 3
  commits: 3
plan_head_before: da0e119479b247805caad256a626076a25f3a517
plan_head_after: e3efe20ddd105ddcd89eebb8d93dc5ddd5b695f7
---

# Phase 20 Plan 12: the coasting dead camera Summary

**The dead camera coasts render-only at Oolite's 160 m/s along the ship's forward axis looking aft, the dust moves with it, the dead view draws every frame while shown, and FIDELITY / PROJECT.md DIV-7 say so.**

## What was built

- **Coast constant and pose rule.** `DEAD_COAST_SPEED_MPS = 160` beside `DEAD_CAMERA_SETBACK_M = 100` in `src/app/session/render-driver.ts`. At presentation time `t = ctx.runtime.gameOverSeconds` the dead camera is `computeViewCamera(position + forward x (100 + 160 t), orientation, "aft", zero shake)` from the frozen pose, in float64, held in a local and never written to the sim. No `FlightMode` comparison was added (the existing `dead` local is used).
- **Dead dust arguments.** While dead, `dust.update` gets the coasting camera's world delta, the speed `DEAD_COAST_SPEED_MPS` when the delta is non-zero and 0 when it is zero (first dead frame, repeated presentation time, context restore: the 0.5 m minimum streaks of the stationary branch), and torus factor 1. Alive frames pass `currentState.speed` and `currentState.torus.factor` as before. `dust.ts`, `explosions.ts` and `debris.ts` are unchanged.
- **Redraw (D-01d visibility bound withdrawn per D-01e).** `shouldDraw` now idles only for `paused || frozenDocked`. Removed: `isDebrisInDeadView`, `NO_DRAW_DISTANCE_FACTOR`, `DEAD_SETTLE_SECONDS`, `deadSettled`, `movingDebrisInView`, their imports and tests. `driftedContact` (D-01c) and the effect time and fade are untouched. 20-SECURITY.md: T-20-25 marked superseded by T-20-42 (accepted); T-20-43 (coast leaking into the sim or hash) added.
- **CHANGELOG** (Task 1 commit, D-15): the Unreleased game-over entry now says the view "drifts away from the wreck, as in Oolite". No version bump, no released section touched.
- **FIDELITY / PROJECT.md.** New faithful row with excerpt E-181 (`PlayerEntity.m:6209-6215`, camera motion only); E-179 row rewritten (range without cap and Oolite's 4.9 km stop, dust streak form as a divergence vs `GL_POINTS`, corrected overtake thresholds 227 m/s small and 306 m/s big, torus edge, every-frame redraw, D-01e authority, Round 3 verdicts Fable L1066, Opus L1096, Sonnet L1126@d7d91e9, consensus L1135@d7d91e9); E-176 reason cross-references T-20-42; ledger gains `DEAD_COAST_SPEED_MPS` and loses the no-draw factor row; the cells into `render-driver.ts` are re-pointed (494 hudHidden, 351 buoyViewStates, 328 computeViewCamera, 325 coast distance, 437 saturate). PROJECT.md DIV-7 rationale and Outcome revised, decision title byte-identical (four FIDELITY rows still quote it).

## Oolite verification (pin 7437f22)

- Direction: `getDestroyedBy:` moves the ship 100 m forward and sets `flightSpeed = 160`, velocity and turn rates zeroed (`PlayerEntity.m:6209-6215`); the dead player still runs `performInFlightUpdates:` (`:2419-2425`), whose `moveForward:delta_t * flightSpeed` (`:3413-3414`) adds the forward vector. `VIEW_AFT` looks along -forward, so the camera travels straight away from the death point it looks at, which recedes at the view centre.
- Explosion: Oolite's bursts carry the ship's velocity (small 1x `OOParticleSystem.m:274`, big 0.85x `:324`); Wegolite's stay at the death position (E-173, kept, tracked in the debris-velocity todo). Overtake thresholds recorded in E-179.
- Dust: Oolite draws `GL_POINTS` while dead (`DustEntity.m:273`, `:365`, `:370`); Wegolite's streak form is a recorded divergence pending the paused-dust todo.

## Tests added

Coast pose at t = 0, 2.5, 30 (camera moves `forward x 400` over 2.5 s); dust arguments at t = 0, 0.5, 0.5, 0.75, 600 (zero delta/0/1, `forward x 80`/160/1, zero/0/1, `forward x 40`/160/1, `forward x 95,880`/160/1) with a frozen 350 m/s and torus 6 state; alive dust arguments (210, 4); first-dead-frame dust now also asserts speed 0 and torus 1; dead view draws 20/20 frames at 4.9, 6, 60, 600 s with and without traffic, any debris and no world; frozen-sim case extended to 600 s with `hashWorld`, `hashFlight`, the state pose and every debris entity unchanged; `redraw-gate.test.ts` pins `redrawGate.next(paused || frozenDocked, drawKeys())`.

## Verification records

- `docker compose run --rm test` (full, container): exit 0. `lint`: clean. `typecheck`: clean. `tests/contract/fidelity.test.ts`: 9/9 with the pin tree mounted (`OOLITE_SRC`), 8 passed + 1 skipped without it.
- Remote `verify`: `snapshot e3efe20`, `exit=0`, `elapsed=210s` (28 Chromium smoke tests passed).
- Remote death specs against the every-frame dead view: `snapshot e3efe20`, `exit=0`, `elapsed=24s`, 3 passed: `death-and-reload.spec.ts:277` 5.4 s and `:372` 5.2 s of the 120 s `test.setTimeout` (about 4.5 %); `game-over-guard.spec.ts:151` 19.9 s against its larger budget (3 x 30 s + the death wait + 3 x 30 s, so at most 11 %). None is above the 60 % line.
- verify-full: deferred to the 20-13 phase gate; must cover e3efe20ddd105ddcd89eebb8d93dc5ddd5b695f7 (20-12's last code/doc commit).
- QUAL-11: no trigger path changed (`git diff --name-only da0e119 -- src/sim src/content/generated/ships-npc.json src/render/bodies` is empty), so the by-hand 20-seed acceptance run is not due.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Three redraw-bound cases removed in Task 1's commit, not Task 2's**
- **Found during:** Task 1
- **Issue:** The three `drawsAt` cases ("moving piece in view past the settle time", "straight away until its no-draw distance", "drifts into the view") assume a camera at rest; the coast invalidates their geometry, so Task 1's targeted Vitest run failed.
- **Fix:** Deleted those three cases in Task 1's commit so every commit stays green; Task 2 removed the rest of the bound (helper, constants, remaining gate cases).
- **Files modified:** tests/app/session/render-driver.test.ts
- **Commit:** d65f429

**2. [Note] FIDELITY.md reflowed by prettier**
- The E-179 and new coast rows exceed the previous widest cells, so `prettier --write FIDELITY.md` re-padded the whole Mechanics table (large mechanical diff, no content change outside the rows listed above).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-20-42 accepted, T-20-43 mitigated by locals only and the Vitest pins).

## For /gsd-verify-work (gap G-20-1)

- Parts 1 and 2 (the frozen dead view, the dust turning into still dashes) are closed in code; the human check is: die in flight, the view looks aft and drifts away from the explosion, dust streams as short lines toward the centre, never still random dashes; also die on the docking approach and note the pass-through of the station. Chromium and Firefox.
- Part 3: the flyers' missing plates are Oolite's own odds (20-UAT.md root cause 1c), so no code changed for them.

## Self-Check: PASSED

- Commits d65f429, ed2943e, e3efe20 exist on the branch; `DEAD_COAST_SPEED_MPS`, E-181 and T-20-42 are present in their files.
