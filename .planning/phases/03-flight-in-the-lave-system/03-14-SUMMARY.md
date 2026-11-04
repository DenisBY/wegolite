---
phase: 03-flight-in-the-lave-system
plan: 14
subsystem: render / planet shader / cadence
tags:
  - planet
  - shader
  - noise-budget
  - swift-shader
  - cadence
  - game-loop
  - world-03
  - g-03-3

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 03-11's calibrated PlanetMix surface, relief and polar ice, whose approved shape this plan must preserve
  - phase: 03-flight-in-the-lave-system
    provides: plan 03-10's palette decode and per-channel terminator, unchanged here
  - phase: 03-flight-in-the-lave-system
    provides: plan 03-03's fixed-step loop cap (5 x 1/120 s) and the pre-gap ~8 fps baseline

provides:
  - src/render/shaders/planet.glsl.ts — SURFACE_OCTAVES/RELIEF_OCTAVES/CLOUD_OCTAVES defines, sea-gated one-octave relief, one-octave cloud field
  - src/render/planet-noise.ts — RELIEF_OCTAVES, CLOUD_OCTAVES = 1, derived NOISE_EVAL_BUDGET = 9, measuredReliefShade
  - src/render/bodies/planet.ts — RELIEF_SCALE 80 confirmed by measurement
  - tests/render/planet-budget.test.ts — budgetViolations, frozenContractViolations, BUDGET_CEILING 9, twelve negative controls

affects:
  - G-03-3 cadence acceptance — the suite is green but the measured message-test duration is 152.4 s against the 133 s gate; the gap stays failed
  - UAT item 1 (Lave visual fidelity) — reopened pending because the relief and cloud fields changed
  - any future change to the planet shader, the loop cap, the HUD wait or the worker policy now fails a unit test

actuals:
  tokens: 6406
  tasks: 2
  commits: 2
  plan_head_before: 9eac217eaa1a8516dc204d938fdb902eb4651c4a
  plan_head_after: 3ae27c7901cd629feafd9b3ecd76180b21759070

tech-stack:
  added: []
  patterns:
    - octave counts live once as shader `#define`s and once as mirror exports; a source-scan guard asserts both, so the GPU and CPU halves cannot drift
    - the software-rasterised cadence gate is one measured number from Playwright's JSON reporter (`spec.tests[].results[].duration`), not an fps target
    - delivery constraints (loop cap, HUD wait, worker policy) are unit-tested source facts, not executor good faith
    - a ceiling (not an equality) lets the pre-agreed slow-run step lower the budget without invalidating its own guard

key-files:
  created:
    - tests/render/planet-budget.test.ts
  modified:
    - src/render/shaders/planet.glsl.ts
    - src/render/planet-noise.ts
    - src/render/bodies/planet.ts
    - tests/render/planet-noise.test.ts
    - tests/render/planet-surface.test.ts
    - .planning/phases/03-flight-in-the-lave-system/03-UAT.md

key-decisions:
  - "The budget became 10 evaluations first (surface 6, two 1-octave relief taps, cloud 2), exactly as planned. The JSON reporter measured 160362 ms for the message test, above the 133 s gate, so the single pre-agreed ladder step was taken: CLOUD_OCTAVES 2 -> 1 and BUDGET_CEILING 10 -> 9 in the same commit."
  - "The relief base height and the displaced taps share RELIEF_OCTAVES: fbmSurface's low partial is the same one-octave field the taps evaluate, so the finite difference measures the slope rather than an octave mismatch."
  - "The relief taps are gated on seaishness < 1.0, the exact set where the shader discards the gradient. `mix(relief.z, 1.0, 1.0) == 1.0`, so the sea is bit-identical; the cloud-field change is not covered by that claim and is carried by UAT item 1."
  - "measuredReliefShade takes the SurfaceCalibration and returns landShare, so it pins the shaded land set (0.6499 for Lave) instead of measuring the whole sphere or hardcoding a per-system constant."
  - "RELIEF_SCALE stays 80: the measured one-octave mean |dU| is 0.00447 versus 0.00486 at three octaves, and 80 gives mean shade 0.8519 / min 0.4636, inside the approved window. It was confirmed, not re-tuned."
  - "The cadence gate is restated, not moved: sim rate = fps x 5/120, so 24 fps was never the requirement. G-03-3 remains failed because the shipped build measures 2.35 fps loaded against the 2.69 fps gate."

requirements-completed: []

coverage:
  - id: D1
    description: "The planet fragment shader performs at most 9 value-noise evaluations per pixel worst case (surface 6, two sea-gated 1-octave relief taps, cloud 1), about 8.3 average."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-budget.test.ts#derives the shipped budget from the defines"
        status: pass
      - kind: unit
        ref: "tests/render/planet-surface.test.ts#keeps the shader's octave counts equal to the mirror's"
        status: pass
    human_judgment: false
  - id: D2
    description: "The approved distributional shape survives: relief shade mean 0.8519, min 0.4636, landShare 0.6499; cloud coverage 0.26001 for the authored 0.26."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-noise.test.ts#keeps the approved Lambert shade over the shaded land set"
        status: pass
      - kind: unit
        ref: "tests/render/planet-noise.test.ts#matches cloud_fraction within ±3 points"
        status: pass
    human_judgment: false
  - id: D3
    description: "The full 29-test browser suite passes with a message-test duration of at most 133000 ms (the 1.3x gate on the unchanged 150 s wait)."
    requirement: WORLD-03
    verification:
      - kind: e2e
        ref: "docker compose run --rm verify (29 passed, 0 failed, 4.9m)"
        status: pass
      - kind: e2e
        ref: "playwright JSON reporter spec.tests[].results[].duration = 152390 ms"
        status: fail
    human_judgment: false
  - id: D4
    description: "A deterministic unit guard fails if the budget, call-site count, sea gate, texture contract, loop cap, HUD wait or worker policy regresses, with twelve message-specific negative controls."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-budget.test.ts (15 tests, including all twelve controls)"
        status: pass
    human_judgment: false
  - id: D5
    description: "src/app/game-loop.ts, src/sim/step.ts, tests/e2e/hud.spec.ts and playwright.config.ts are unmodified; the 5-step cap, 150 s wait and implicit 2-worker policy remain."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-budget.test.ts#frozen delivery contract"
        status: pass
      - kind: other
        ref: "git diff 9eac217..HEAD -- src/app/game-loop.ts src/sim/time.ts tests/e2e/hud.spec.ts playwright.config.ts (empty)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The real-GPU rendered look after the relief and cloud reduction."
    requirement: WORLD-03
    verification: []
    human_judgment: true
    rationale: "Rendered fidelity is a visual judgement; 03-UAT.md item 1 is reopened pending and must be re-run on a real GPU."

duration: 33min
completed: 2026-11-04
status: halted
---

# Phase 3 Plan 14: Planet Noise Budget and Cadence Guard Summary

**The planet's worst-case per-pixel noise budget fell from 16 to 9 evaluations, the approved relief shape was confirmed by measurement, and a fifteen-test guard with twelve message-specific controls now freezes the budget, loop cap, HUD wait and worker policy — but the message-expiry test still measures 152.4 s against the 133 s cadence gate, so G-03-3 is halted, not closed.**

## Performance

- **Duration:** 33 min
- **Started:** 2026-11-04T14:50Z (approx., first focused run)
- **Completed:** 2026-11-04T15:23Z
- **Tasks:** 2 executed (task 2's cadence gate did not pass)
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- Cut the fragment shader from 16 to 9 value-noise evaluations per pixel: surface 6, two sea-gated one-octave relief taps, cloud 1. The 10-evaluation intermediate (cloud 2) was shipped first exactly as planned, then the single pre-agreed ladder step was taken.
- Kept the relief base and the taps in lockstep: `fbmSurface`'s low partial uses `RELIEF_OCTAVES`, so `dU = hU - h0` measures the slope, not an octave mismatch.
- Gated the taps on `seaishness < 1.0`, the exact set where `shade` is discarded (`mix(relief.z, 1.0, 1.0) == 1.0`). The sea's relief/shade multiplier is bit-identical; the cloud-field reduction is not covered by that claim and is carried by UAT item 1.
- Added `measuredReliefShade(calibration, seed, reliefScale)`: 4,096 directions, the shader's own gate, returns `landShare` so the land set (0.6499) is provable. Pinned mean 0.8519, min 0.4636, and a scale-4.0 control above 0.999.
- Confirmed `RELIEF_SCALE` 80 by measurement rather than re-tuning it: one-octave mean `|dU|` 0.00447 versus 0.00486 at three octaves.
- Added `tests/render/planet-budget.test.ts` with `budgetViolations`, `frozenContractViolations`, `BUDGET_CEILING = 9`, and all twelve negative controls.
- Ran the full 29-test suite twice (10- and 9-evaluation builds), both green, and measured the message test with the JSON reporter both times.

## Cadence Measurement (the gate)

The decisive number is `spec.tests[].results[].duration` for
`the message line is one clamped line and expires on flightTime`.

| Build | Duration | fps (`358.1 / s`) | Launch (`48 / fps`) | Drain (`12.92 x 24 / fps`) | Headroom (`150 / drain`) | Suite |
|---|---|---|---|---|---|---|
| 10 evals (cloud 2) | **160362 ms** | 2.23 | 21.5 s | 139.0 s | 1.08x | 29/29 green |
| 9 evals (cloud 1, shipped) | **152390 ms** | 2.35 | 20.4 s | 132.0 s | 1.14x | 29/29 green |
| Gate | <= 133000 ms | >= 2.69 | 17.9 s at the floor | <= 115.4 s | >= 1.3x | 29/29 |

The gate is the plan's 1.3x reading of the unchanged 150 s wait: a drain of at
most `150 / 1.3 = 115.4` s needs `fps >= 12.92 x 24 / 115.4 = 2.69`; the launch
segment adds `48 / fps`, so the same gate is `(12.92 + 2) x 24 / 2.69 = 133` s
of total duration. Nothing was subtracted from either measured duration and no
constant from the 16-evaluation build was borrowed. **Both measured builds miss
the gate.**

## The Cost Model Is Wrong

The plan's two-point fit (about 41 ms fixed per frame plus 12.0 ms per average
evaluation) predicted 2.9-3.0 fps loaded and a 120-122 s duration at 10
evaluations. The measured 10-evaluation build ran at 2.23 fps loaded (448 ms per
frame), and the 9-evaluation build at 2.35 fps (426 ms per frame). Solving the
two measured loaded points against the debug session's 16-evaluation baseline
(1.93 fps, 518 ms) gives roughly **340-350 ms of fixed per-frame cost plus
~11-12 ms per evaluation**, i.e. the noise evaluations are only about a fifth of
the loaded frame. That is why 16 -> 10 bought only ~15% fps and 10 -> 9 only
~7%, and why the single permitted ladder step could not reach 133 s.

Per the plan, no other lever was touched: `src/app/game-loop.ts`,
`src/sim/time.ts`, `tests/e2e/hud.spec.ts`, `playwright.config.ts` and
`SURFACE_OCTAVES` are unmodified, and `frozenContractViolations` now fails if
someone changes them.

## Restatement of G-03-3 `missing[0]`

G-03-3's `missing[0]` said "rendered cadence >= 24 fps". That was never the
requirement: the loop advances simulated time at exactly `fps x 5/120`, so the
gate is the drain arithmetic. 2.07 fps loaded is the absolute floor
(`12.92 / 150` sim rate), and the 1.3x gate is 2.69 fps (drain <= 115.4 s,
total <= 133 s). The shipped 9-evaluation build measures 2.35 fps loaded
(152.4 s, 1.14x), so **G-03-3 remains failed on the restated gate**. The same
restatement is recorded under G-03-3 in `03-UAT.md`; the gap status is still
`failed`.

## Cloud-Coverage Re-pin

The cloud field dropped from 4 octaves to 1 (the slow-run step). `calibrateClouds`
still derives the threshold from the authored 0.26, and the measured coverage is
**0.26001** (asserted to 2 dp as 0.26).

## Twelve Negative Controls

`budgetViolations` / `frozenContractViolations` controls, each asserting a
violation that names its constant:

1. raised `RELIEF_OCTAVES` 1 -> 3 (sum 14 above the ceiling)
2. a fourth `fbm(` tap
3. removed sea gate (`if (seaishness < 1.0)`)
4. HUD wait 150 s -> 300 s
5. HUD `test.setTimeout` 180 s -> 90 s
6. `MAX_STEPS_PER_FRAME = 6`
7. `DT = 1 / 60`
8. `MAX_FRAME_DELTA = 0.5`
9. `playwright.config.ts` declaring `workers: 1`
10. `CLOUD_OCTAVES` 2 with the mirror budget 10, so the define sum equals the passed budget and `BUDGET_CEILING` must fire
11. injected `texture2D(` sample
12. an extra `valueNoise(` call outside `fbm`/`fbmSurface`

## Task Commits

Each task was committed atomically:

1. **Task 1: Cut the budget from 16 to 10 with the relief base and mirror in lockstep** — `434576b` (perf)
2. **Task 2: Budget guard, the one cloud ladder step to 9 evaluations, and measured cadence** — `3ae27c7` (perf)

**Plan metadata:** committed after this summary (docs, `status: halted`).

## Files Created/Modified

- `src/render/shaders/planet.glsl.ts` — octave defines, shared relief octave count, sea-gated one-octave taps, one-octave cloud, honest budget comment.
- `src/render/planet-noise.ts` — `RELIEF_OCTAVES`, `CLOUD_OCTAVES = 1`, derived `NOISE_EVAL_BUDGET = 9`, `measuredReliefShade`.
- `src/render/bodies/planet.ts` — `RELIEF_SCALE` comment replaced with the measured numbers; constant stays 80.
- `tests/render/planet-budget.test.ts` — the guard and its twelve controls.
- `tests/render/planet-noise.test.ts` — relief-shade distribution pin, scale-4.0 control, cloud-coverage re-pin.
- `tests/render/planet-surface.test.ts` — shader octave defines must equal the mirror exports.
- `.planning/phases/03-flight-in-the-lave-system/03-UAT.md` — G-03-3 restatement, item 1 reopened pending, summary 4 passed / 1 pending / 6 total / 1 issue.

## Deviations from Plan

### Planned deviation: the single pre-agreed slow-run ladder step

**1. [Rule 3 - Blocking] Lowered `CLOUD_OCTAVES` 2 -> 1 and `BUDGET_CEILING` 10 -> 9**

- **Found during:** Task 2, after the first JSON-reporter full-suite run.
- **Issue:** The 10-evaluation build was green 29/29 but measured 160362 ms, above the 133000 ms gate.
- **Fix:** The plan's one permitted ladder step: cloud 2 -> 1, ceiling 10 -> 9, shader/mirror docs to 9 / about 8.3, focused tests and the full gate re-run.
- **Files modified:** `src/render/shaders/planet.glsl.ts`, `src/render/planet-noise.ts`, `tests/render/planet-budget.test.ts`, `tests/render/planet-noise.test.ts`.
- **Verification:** focused render tests 137 passed; `docker compose run --rm verify` 29/29 passed; JSON duration 152390 ms.
- **Committed in:** `3ae27c7`.

**Outcome:** the step did not clear the gate (152390 ms > 133000 ms). No further
lever was available under the plan, so this is recorded as a halted gate, not a
pass.

### Auto-fixed Issues

None. Prettier reformatted the new test file once; that is formatting, not a
deviation.

**Total deviations:** 1 planned ladder step (required by the plan). **Impact:**
the shipped budget is 9, the guard's ceiling is 9, and the cadence gate remains
unmet.

## Issues Encountered

- The plan's cost model is a two-point extrapolation and under-predicted the
  fixed per-frame cost by roughly 2.3x. The measured evidence says the noise
  budget is not the dominant loaded cost; reducing it further cannot reach 133 s
  without touching a frozen constraint or the visual contract.
- The first JSON measurement (160362 ms) and the verify run's `list` report
  (`2.6m`) agree; the second JSON measurement (152390 ms) and its verify
  (`2.5m`) also agree. This is not measurement noise.

## Verification

Run in Docker, observed:

- `docker compose run --rm test npx vitest run tests/render tests/app tests/content` — 16 files, 154 tests passed (10-eval build).
- `docker compose run --rm test npx vitest run tests/render tests/compliance.test.ts` — 13 files, 137 tests passed (9-eval build).
- `docker compose run --rm typecheck` — exit 0, no `error TS`.
- `docker compose run --rm lint` — ESLint clean, Prettier clean.
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/scene.spec.ts"` — 3 passed (early GLSL-compile check).
- `docker compose run --rm verify` (10-eval build) — 530 unit tests passed, build ok, 29/29 Playwright passed.
- `docker compose run --rm e2e sh -lc "npm run build && PLAYWRIGHT_JSON_OUTPUT_NAME=playwright-results.json npx playwright test --reporter=json"` (10-eval) — 29 passed; message test 160362 ms; report deleted.
- `docker compose run --rm verify` (9-eval build) — 29/29 Playwright passed.
- Same JSON run (9-eval) — 29 passed; message test 152390 ms; report deleted.

## User Setup Required

None.

## Next Phase Readiness

**Not ready to close G-03-3.** The suite is green and the deterministic guard is
in place, but the cadence gate is not met (152.4 s vs 133 s). A new gap plan
needs the real loaded fixed cost (the evidence points away from the noise
budget) or an explicit user decision to change a frozen constraint. Do not
advance the phase on this summary.

**UAT obligation:** G-03-3 is **not visually closed** until UAT item 1 (Lave
visual fidelity) is re-run and passed on a real GPU. The relief dropped 3 -> 1
octave and the cloud field 4 -> 1 octave; `03-UAT.md` item 1 is `result:
[pending]` with the reason recorded, and the `## Summary` is 4 passed / 1
pending / 6 total / 1 issue.

## Self-Check: PASSED

- `tests/render/planet-budget.test.ts` — FOUND
- `src/render/shaders/planet.glsl.ts`, `src/render/planet-noise.ts`, `src/render/bodies/planet.ts` — FOUND
- `tests/render/planet-noise.test.ts`, `tests/render/planet-surface.test.ts` — FOUND
- `.planning/phases/03-flight-in-the-lave-system/03-UAT.md` — restatement, reopened item 1, summary 4/1/6/1 — FOUND
- Commits `434576b` (task 1) and `3ae27c7` (task 2) — both ancestors of HEAD
- `playwright-results.json` — deleted, not tracked
