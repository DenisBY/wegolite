---
phase: 03-flight-in-the-lave-system
plan: 11
subsystem: render / planet-surface
tags:
  - planet
  - noise
  - calibration
  - planetmix
  - polar-cap
  - relief
  - glsl
  - world-03
  - g-03-1

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 03's one-sphere procedural planet material and the Lave g0-s7 fixture
  - phase: 03-flight-in-the-lave-system
    provides: plan 03-10's decoded linear-light palette and per-channel terminator (rebased on, preserved)
  - phase: 02-data-pipeline-content-compiler
    provides: the compiled g0-s7 record with land_fraction 0.65, cloud_fraction 0.26 and random_seed "56 173 156 20 29 21"

provides:
  - src/render/planet-noise.ts — hash31/valueNoise/fbm mirror, Fibonacci sampler, calibrateSurface/calibrateClouds, measurement helpers, classifySurface
  - src/render/bodies/planet.ts — calibration uniforms derived once from the compiled record, percent_ice-driven polarFraction, uReliefScale
  - src/render/shaders/planet.glsl.ts — planetMix (deep sea/sea/shelf/coast/land/snowline/ice), Lambert relief, normalised cloud field
  - src/content/schemas/system.ts — optional percent_ice
  - tests/render/planet-noise.test.ts, tests/render/planet-surface.test.ts — calibration and shader-contract proofs

affects:
  - plan 03-12 (exposure model; no shared files, but the planet's final colour path is now settled)
  - WORLD-03 visual acceptance (65% land, layered sea, visible relief, noise-broken ice cap)

actuals:
  tokens: 14679
  tasks: 2
  commits: 2
  plan_head_before: d5f18566cfa7722509b2142be944e430e6405da8
  plan_head_after: 3374c07473042d68022eb52655d8e054f53a7e54

tech-stack:
  added: []
  patterns:
    - measurement-first calibration — a CPU mirror of the shader field derives thresholds as quantiles, never constants
    - uniform/mirror contract test that scans the shader's declarations against the material both ways
    - negative-control assertions (the uncalibrated threshold must fail the same measurement)

key-files:
  created:
    - src/render/planet-noise.ts
    - tests/render/planet-noise.test.ts
    - tests/render/planet-surface.test.ts
  modified:
    - src/render/bodies/planet.ts
    - src/render/shaders/planet.glsl.ts
    - src/content/schemas/system.ts
    - tests/render/planet-shader.test.ts

key-decisions:
  - "Calibration is a quantile of the measured field, not a threshold guess: cutting the transformed sample w at 1 - land_fraction makes the land set exactly land_fraction of the sphere by construction (0.6499 measured for 0.65)."
  - "mixHi is 0.66667 * (1 + seaBias) = 0.28581 — Oolite's two-thirds rule applied to this field's top (1 + seaBias = 0.42871), not the literal 0.66667 * land_fraction = 0.43334, which sits above the reachable top and empties the snowline band."
  - "The relief base height is the three-octave partial that fbmSurface already accumulates, so two displaced 3-octave taps are the entire relief cost (16 evaluations per pixel)."
  - "uReliefScale is 80, not the plan's starting 4.0: the measured three-octave height difference over the 0.006 rad step averages 0.0076, so 4.0 modulated shade by under 0.1% (invisible) while 80 maps the mean slope to a 0.85 shade and the steepest to 0.43. Documented in planet.ts as presentation tuning."
  - "Ice flattens the relief only through seaishness (water), following the plan; Oolite additionally damps the specular channel under ice, which is a rendering nuance this port does not carry."
  - "The shader declares uLandFraction and uCloudFraction even though the calibration uniforms now carry the level set, so the material cannot accumulate dead wiring; the contract test asserts the declaration set equals the supply set exactly."

requirements-completed:
  - WORLD-03

coverage:
  - id: D1
    description: "The sphere's land share is 0.6499 for the authored 0.65 (±2 points), and the uncalibrated negative control measures 0.8879 on the raw field (0.7466 on the normalised field)."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-noise.test.ts#turns land_fraction into the measured land share ±2 points"
        status: pass
      - kind: unit
        ref: "tests/render/planet-noise.test.ts#beats the uncalibrated threshold by a wide margin"
        status: pass
    human_judgment: false
  - id: D2
    description: "The surface is a PlanetMix port with all seven reachable classes present (deep 0.0566, sea 0.2788, shelf 0.0146, coast 0.0110, land 0.4321, highland 0.0142, ice 0.1926), plus the snowline at 0.28581 below the measured q top 0.42871."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-noise.test.ts#covers all seven reachable PlanetMix classes"
        status: pass
      - kind: unit
        ref: "tests/render/planet-noise.test.ts#puts the snowline strictly below the reachable top"
        status: pass
      - kind: unit
        ref: "tests/render/planet-surface.test.ts#keeps the sea layered and the snowline non-empty"
        status: pass
    human_judgment: false
  - id: D3
    description: "Polar ice is percent_ice-driven: no ice at the equator, 100% at |lat| >= 60, begins at 49.59, and grows from 0.1926 to 0.4067 when polarFraction rises to 0.5."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-noise.test.ts#derives the cap from percent_ice and covers the pole"
        status: pass
      - kind: unit
        ref: "tests/render/planet-noise.test.ts#grows the cap when the authored ice fraction grows"
        status: pass
    human_judgment: false
  - id: D4
    description: "Cloud coverage is 0.2600 for the authored 0.26 (±3 points), up from the pre-fix ~2.7% speckle."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-noise.test.ts#matches cloud_fraction within ±3 points"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every shader uniform is supplied and every material uniform is declared (including uReliefScale), and the shader's band constants equal the mirror's."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-surface.test.ts#declares exactly the uniforms the material supplies, both ways"
        status: pass
      - kind: unit
        ref: "tests/render/planet-surface.test.ts#keeps the shader's band constants equal to the mirror's"
        status: pass
    human_judgment: false
  - id: D6
    description: "The 16-evaluation fragment budget leaves the software-rasterised browser suite green: the scene and HUD e2e specs pass without an inFlight timeout."
    requirement: WORLD-03
    verification:
      - kind: e2e
        ref: "docker compose run --rm e2e sh -lc \"npm run build && npx playwright test tests/e2e/scene.spec.ts tests/e2e/hud.spec.ts\" — 6 passed"
        status: pass
    human_judgment: false
  - id: D7
    description: "Visual acceptance: Lave shows a recognisable 65% land planet with dark deep sea, a coastal shelf, visible relief, sparse cloud and a white noise-broken ice cap around 50 degrees latitude."
    requirement: WORLD-03
    verification: []
    human_judgment: true
    rationale: "Rendered appearance cannot be asserted without screenshots, which this project does not use; every number the human is asked to confirm is measured above."

duration: 10min
completed: 2026-11-04
status: complete
---

# Phase 3 Plan 11: Calibrated PlanetMix surface Summary

**Lave's field is now measured, not guessed: the coastline is the 65% land quantile (0.6499), the sea is layered into shelf/sea/deep, the snowline band is reachable at 0.28581, and a percent_ice-driven noise-broken cap covers the pole from |lat| 49.59.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-04T10:28:06Z
- **Completed:** 2026-11-04T10:38:07Z
- **Tasks:** 2
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- Added `src/render/planet-noise.ts`, a deterministic, Three-free CPU mirror of the shader's `hash31`/`valueNoise`/`fbm` plus a 4,096-direction Fibonacci sphere. `calibrateSurface` measures the field the shader draws and cuts it at the `1 - land_fraction` quantile: the land share is exact by construction (0.6499 for Lave's 0.65, 0.3000 for 0.30, 0.8499 for 0.85).
- Debunked the pre-fix threshold with a negative control in the suite: the raw field cut at 0.35 is 88.8% land, the normalised field 74.7% — both far outside the ±2-point acceptance, so the quantile cut is doing real work.
- Derived the snowline as `mixHi = 0.66667 * (1 + seaBias) = 0.28581`, strictly below the measured q top 0.42871. The literal `0.66667 * land_fraction = 0.43334` is proven above the top and yields zero highland, and the pre-fix positive bias is proven to leave the accepted band; both regressions fail the suite.
- Replaced the single land smoothstep and latitude-only polar wash with Oolite's `PlanetMix`: deep sea at 0.85x black, open-sea and coastal-shelf blends, a 1/160 coastline, the snowline, and a `phi = 2 * polarCap - nearPole` ice cap with a 0.02 ramp. The seven reachable classes partition the sphere and are each measured.
- Ported Oolite's Lambert terrain shade with two three-octave height taps and the base height reused from the surface `fbm` accumulation, so the relief costs exactly 6 extra noise evaluations; `shade` is flattened over water by the `seaishness` the same function returns.
- Wired all nine calibration uniforms plus `uReliefScale` from `planet.ts`; `landThresholdFor` is deleted and `percent_ice` (Oolite default 5) drives `polarFraction`. A contract test scans the fragment shader's declarations against the material's supply set in both directions.
- Preserved 03-10's colour contract: the palette stays decoded to linear light once, the per-channel terminator multiplies the final ground+cloud colour, and the air rim stays gated on the lit side.

## Task Commits

Each task was committed atomically:

1. **Task 1: noise mirror + quantile calibration** — `5ef2716` (feat)
2. **Task 2: PlanetMix, relief and polar cap** — `3374c07` (feat)

**Plan metadata:** committed after this summary (docs).

## Files Created/Modified

- `src/render/planet-noise.ts` — mirror, sampler, calibration, measurement helpers, `classifySurface`; memoised raw field per seed.
- `src/render/bodies/planet.ts` — calibration uniforms, `polarFraction`, `RELIEF_SCALE`; `landThresholdFor` removed.
- `src/render/shaders/planet.glsl.ts` — `planetMix`, `fbmSurface`/relief, normalised clouds; backticks removed from in-template comments and `sample` renamed (GLSL reserved word).
- `src/content/schemas/system.ts` — optional `percent_ice` with the Oolite default documented.
- `tests/render/planet-noise.test.ts` — 14 tests: mirror invariants, sampler uniformity, land/cloud/ice calibration, class coverage, negative controls.
- `tests/render/planet-surface.test.ts` — 5 tests: uniform wiring both ways, band-constant equality, uploaded-calibration re-measurement, polar_sea_color 253-byte ice pin.
- `tests/render/planet-shader.test.ts` — calibration uniform pins and PlanetMix source assertions replace the deleted threshold test.

## Verification Observed (all in Docker)

- `docker compose run --rm test npx vitest run tests/render/planet-noise.test.ts tests/compliance.test.ts` — 24 passed.
- `docker compose run --rm test npx vitest run tests/render/planet-shader.test.ts tests/render/planet-surface.test.ts tests/render/planet-noise.test.ts tests/compliance.test.ts` — 46 passed.
- `docker compose run --rm test npx vitest run tests/render tests/app tests/content` — 128 passed (15 files).
- `docker compose run --rm test` — **489 passed** (52 files).
- `docker compose run --rm typecheck` — clean.
- `docker compose run --rm lint` — clean (`eslint .` and Prettier).
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/scene.spec.ts tests/e2e/hud.spec.ts"` — **6 passed** (2.5 min), no `inFlight` timeout, no console/page error.

**Measured land fraction:** `measuredLandFraction(calibrateSurface(49.192859, 0.65, 0.05), 49.192859) = 0.64990234375` (2,662 of 4,096 directions). Cloud coverage 0.26001; q range `[-0.49190, 0.42872]`; ice begins at |lat| 49.594 and the whole polar cap is icy.

## Decisions Made

- **Calibration is a quantile, not a constant.** `w = u + nP * poleValue / (1 - nP)` is affine in `seaBias`, and `q = (1 - nP)(w + seaBias)`, so the `1 - land_fraction` quantile of `w` makes `q > 0` exactly the land set.
- **`mixHi` follows the field, not the literal Oolite expression.** Oolite's `0.66667 * land_fraction` assumes a field topping at `land_fraction`; this field tops at `1 + seaBias`, so the same rule is `0.66667 * (1 + seaBias)`.
- **Relief base height is free.** `fbmSurface` returns the normalised three-octave partial alongside the six-octave sum, so the two displaced taps (3 + 3 octaves) are the whole relief budget.
- **`uReliefScale = 80`.** Measured: the three-octave height difference over the 0.006 rad step averages 0.0076 and peaks at 0.026; the plan's starting 4.0 would have been sub-0.1% (invisible), 80 gives a 0.85 mean / 0.43 steepest shade. Recorded as presentation tuning in `planet.ts`.
- **Ice does not damp relief.** Oolite additionally halves its specular channel under ice; this port keeps `seaishness` from water only, per the plan's `planetMix` contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GLSL ES reserved word `sample` broke the fragment compile**
- **Found during:** the plan's e2e step (all 6 browser tests failed with `'sample' : Illegal use of reserved word` in `fbmSurface`).
- **Fix:** renamed the local to `noiseSample`. Unit tests could not catch it; the e2e did, which is exactly why the plan requires it.

**2. [Rule 1 - Bug] Backticks inside the fragment template literal broke the TS parse**
- **Found during:** the first focused vitest run (`Expected a semicolon` at `planet.glsl.ts:93`).
- **Fix:** quoted the identifiers in in-template GLSL comments with single quotes; the module doc comment outside the template keeps its Markdown backticks. Same failure mode 03-10 recorded.

**3. [Rule 2 - Missing critical functionality] `uReliefScale` at the plan's 4.0 would be invisible**
- **Found during:** measuring the relief gradient on the mirror before wiring the shader.
- **Fix:** set 80 and documented the measurement next to the uniform. A uniform that renders no relief would pass every test while failing the plan's "visible relief" goal.

## Deferred Issues

- The real-GPU appearance (deep-sea contrast, relief strength, ice-edge ragging) remains a human UAT item; the automated suite pins every number but not the look.
- Oolite's ice specular damping and its texture-space normal map are not ported; not required by this plan.

## Issues Encountered

- `quantile`/`sortedAscending` originally accepted `readonly number[]`, which rejects `Float64Array` under `strict`; widened to `ArrayLike<number>`.

## User Setup Required

None.

## Next Phase Readiness

- Plan 03-12 can proceed: the planet's final colour path (decoded palette → calibration → PlanetMix → relief → terminator) is settled, and the exposure model can treat the planet as one linear-light material.
- The mirror is the place to add measurement for any future surface work; the contract test keeps the shader and the mirror from drifting apart.
- Human UAT should confirm the 65% land read, layered sea, visible relief and the ice cap beginning near 50 degrees on a real GPU.

## Self-Check: PASSED
