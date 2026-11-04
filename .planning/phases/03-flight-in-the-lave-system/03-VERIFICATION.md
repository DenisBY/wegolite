---
phase: 03-flight-in-the-lave-system
verified: 2026-11-04T17:28:46Z
status: passed
score: 5/5
covered_files:
  - .planning/PROJECT.md
  - .planning/phases/03-flight-in-the-lave-system/03-01-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-01-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-02-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-02-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-03-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-03-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-04-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-04-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-05-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-05-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-06-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-06-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-07-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-07-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-08-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-08-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-09-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-09-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-10-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-10-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-11-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-11-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-12-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-12-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-13-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-13-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-14-PLAN.md
  - .planning/phases/03-flight-in-the-lave-system/03-14-SUMMARY.md
  - .planning/phases/03-flight-in-the-lave-system/03-REVIEW-DISPOSITION.md
  - .planning/phases/03-flight-in-the-lave-system/03-UAT.md
  - playwright.config.ts
  - playwright.diag.config.ts
  - src/app/boot.ts
  - src/app/fallback.ts
  - src/app/game-loop.ts
  - src/app/game-session.ts
  - src/app/probe.ts
  - src/app/scene-manager.ts
  - src/input/actions.ts
  - src/input/keyboard.ts
  - src/main.ts
  - src/render/bodies/planet.ts
  - src/render/bodies/station.ts
  - src/render/color.ts
  - src/render/exposure.ts
  - src/render/hud/draw.ts
  - src/render/hud/messages.ts
  - src/render/hud/projection.ts
  - src/render/planet-noise.ts
  - src/render/shaders/planet.glsl.ts
  - src/render/system-scene.ts
  - src/render/viewport.ts
  - src/settings/schema.ts
  - src/settings/store.ts
  - src/sim/flight/attitude.ts
  - src/sim/flight/controller.ts
  - src/sim/flight/launch.ts
  - src/sim/flight/speed.ts
  - src/sim/flight/torus.ts
  - src/sim/step.ts
  - src/sim/time.ts
  - src/sim/world/aegis.ts
  - src/sim/world/layout.ts
  - tests/app/dispose.test.ts
  - tests/diag/frame-cost.spec.ts
  - tests/e2e/aspect.spec.ts
  - tests/e2e/dispose.spec.ts
  - tests/e2e/fallback.spec.ts
  - tests/e2e/flight.spec.ts
  - tests/e2e/helpers/probe.ts
  - tests/e2e/hud.spec.ts
  - tests/e2e/launch.spec.ts
  - tests/e2e/models.spec.ts
  - tests/e2e/precision.spec.ts
  - tests/e2e/resize.spec.ts
  - tests/e2e/scene.spec.ts
  - tests/e2e/settings.spec.ts
  - tests/hud/format.test.ts
  - tests/hud/projection.test.ts
  - tests/input/bindings.test.ts
  - tests/render/color.test.ts
  - tests/render/exposure.test.ts
  - tests/render/planet-budget.test.ts
  - tests/render/planet-noise.test.ts
  - tests/render/planet-shader.test.ts
  - tests/render/planet-surface.test.ts
  - tests/render/station.test.ts
  - tests/render/viewport.test.ts
  - tests/settings/schema.test.ts
  - tests/sim/aegis.test.ts
  - tests/sim/flight-attitude.test.ts
  - tests/sim/flight-controller.test.ts
  - tests/sim/flight-speed.test.ts
  - tests/sim/launch.test.ts
  - tests/sim/layout.test.ts
  - tests/sim/mass-lock.test.ts
  - tests/sim/torus.test.ts
covered_digest: "v4:sha256:126c51111cf12cea5dd209c2c5c264062eb3791e544edf503f1649ed9cb02892"
behavior_unverified: 0
overrides_applied: 2
overrides:
  - must_have: "The full browser suite passes, and the message-expiry test's total duration is at most 133 s (the plan's 1.3x cadence gate on the unchanged 150 s wait)."
    reason: "G-03-3 was accepted as a known issue by explicit user decision on 2026-11-04, not fixed. The 24 fps and 133 s figures were never requirements: the message-expiry spec is a correctness wait on simulated flightTime, and QUAL-01 (60 fps at 1080p on mid-range hardware) is Phase 7. The suite is green 29/29 under the pinned 300 s ceiling; the measured message test is ~156 s."
    accepted_by: "User"
    accepted_at: "2026-11-04T17:08:57Z"
  - must_have: "tests/e2e/hud.spec.ts keeps its 150 s wait and playwright.config.ts keeps the implicit 2-worker default (the loop cap stays MAX_STEPS_PER_FRAME = 5, DT = 1 / 120, MAX_FRAME_DELTA = 0.25)."
    reason: "The loop cap is unchanged. The browser-gate configuration was deliberately stabilised as the accepted known-issue mitigation: wait 150 s -> 300 s, test timeout 180 s -> 330 s, workers: 2 pinned, and frozenContractViolations now requires those literals. This makes the contention reproducible and turns a cadence regression into a 'stuck' failure instead of a flaky 'slow' one. Recorded in PROJECT.md Key Decisions."
    accepted_by: "User"
    accepted_at: "2026-11-04T17:08:57Z"
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "G-03-3 — the message-expiry browser gate: resolved as an accepted known issue by explicit user decision (PROJECT.md Key Decisions; 03-UAT.md gap status resolved). The wait was raised 150 s -> 300 s, the test timeout 180 s -> 330 s, workers: 2 pinned, and the full gate is green 29/29. No product change."
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "WORLD-06 hyperspace distance/fuel/jump-time math"
    addressed_in: "Phase 6"
    evidence: "ROADMAP Phase 6 requirements explicitly include WORLD-06; not a Phase 3 gap"
advisory:
  - finding: "Open code-review warnings WR-02..WR-07 remain undispositioned (start() disposal race, unguarded post-preload boot steps, blocked-storage throw, unrendered pre-Start menu scene, pause renders the previous fixed-step pose, reset does not clear live hints)."
    category: other
    reason: "Recorded in 03-REVIEW-DISPOSITION.md on 2026-11-03, before the 03-10..03-14 gap-closure rounds. None is traceable to a Phase 3 requirement and none produced a failing test or a reproducible command during this pass; the full 531-test unit suite and 29-test browser gate are green."
    evidence_status: "none provided"
  - finding: "WR-10: the mirror/shader parity suite pins only three band #define values, so noise constants, SURFACE_SCALE, CLOUD_SCALE, the octave cap and the ice ramp can drift while tests stay green."
    category: other
    reason: "Test-quality observation carried from the prior report. planet-budget.test.ts now pins the octave counts, the call-site counts, the sea gate and the texture contract, but not the band thresholds. No current rendering defect is demonstrated."
    evidence_status: "none provided"
---

# Phase 3: Flight in the Lave System Verification Report

**Phase Goal:** The player launches from Lave's Coriolis station and flies the Cobra through a faithfully scaled, stably rendered system that reads as Oolite at a glance.
**Verified:** 2026-11-04T17:28:46Z
**Status:** passed
**Re-verification:** Yes — after G-03-3 was resolved as an accepted known issue (stabilisation round `0d41ed7`, `3e7e778`, `313a2bf`) and after plan `03-14` landed (noise budget 16 -> 9)

## Goal Achievement

### Observable Truths (roadmap contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Starting a new game shows Lave with witchpoint, planet, sun and Coriolis at faithful relative positions/scale, lit and recognisably Oolite | ✓ VERIFIED | `src/sim/world/layout.ts` derives all five bodies from `g0-s7`; exact pins in `tests/sim/layout.test.ts` (planet z `-452,760` r `41,160`, station-planet `82,273.476 m`, sun r `84,449.095 m`); `tests/e2e/scene.spec.ts` re-asserts them through the probe. The palette is decoded once (`src/render/color.ts`), PlanetMix is mirrored (`src/render/planet-noise.ts`), and one exposure contract (`src/render/exposure.ts`) lifts the Coriolis to the Oolite band. UAT item 1 (`pass`) confirms the rendered look on a real GPU after the 03-14 relief/cloud reduction |
| 2 | Launch and fly with pitch/roll only — ramped rates, 350 top speed, thrust acceleration, no yaw/drift | ✓ VERIFIED | `src/sim/flight/{launch,attitude,speed}.ts`: `+600 s` applied once (`launch.ts:48`), only pitch about local +X and roll about local +Z (`attitude.ts:69-71`), scalar forward speed capped at 350 with 160 u/s² thrust (`speed.ts`). `tests/sim/{launch,flight-attitude,flight-speed}.test.ts` green in the full suite; `tests/e2e/launch.spec.ts` and `flight.spec.ts` pass |
| 3 | Torus engages, mass-locks near station/planet, disengages on input; HUD shows all eleven elements | ✓ VERIFIED | `src/sim/flight/torus.ts` (`32..1024`, exact `clamp(32*sqrt(d/102400))`, mass-lock predicates before integration), `src/sim/world/aegis.ts` (51,200 m station, 123,480 m planetary), `src/render/hud/draw.ts` exact eleven-element set (`crosshair, scanner, compass, aegis, speed, roll, pitch, fuel, clock, condition, message`), scanner range 25,600 m (`hud/projection.ts:27`). `tests/e2e/flight.spec.ts`, `tests/e2e/hud.spec.ts` pass; message expiry passes in 2.6 min under the pinned 300 s ceiling |
| 4 | The view stays stable from witchpoint to station — no visible jitter/z-fighting across ~1.4e6 m | ✓ VERIFIED | Single `cameraRelative()` path, camera at origin, float32 ULP proof, polygonOffset/renderOrder; `src/render/viewport.ts` is the only writer of `camera.aspect` (`rg "\.aspect\s*="` finds one write at `viewport.ts:56`), applied on every `SceneManager` install (`scene-manager.ts:89,118,131`). `tests/e2e/aspect.spec.ts` proves 2222x1000 -> 2.222 (3/3 pass); UAT item 2 (`pass`) confirms circular limb/unsquashed station on a 4K real GPU |
| 5 | A browser without WebGL2 shows a clear fallback; returning to a system returns GPU memory to baseline | ✓ VERIFIED | `src/app/boot.ts` WebGL2 guard (three failure modes), `fallback.ts` visible `#failure` text; `tests/e2e/fallback.spec.ts` 4/4 pass. `scene-manager.ts` build-before-swap + dispose + `renderer.renderLists.dispose()`; `tests/e2e/dispose.spec.ts` three-swap non-growth and pagehide/reload pass |

**Score:** 5/5 roadmap success criteria verified. Plan must-haves: 26/26 in 03-10..03-13 VERIFIED (carried, regression-checked); 5/5 in 03-14 (3 VERIFIED + 2 PASSED (override)).

### Gap-Closure Plan Must-Haves (03-10..03-14)

All 26 truth statements in plans 03-10..03-13 were checked against the source in the prior report and regression-checked here; 26/26 remain VERIFIED. Plan 03-14 is new since that report and was verified in full this round.

| Plan | Truths | Status | Code evidence |
|------|--------|--------|---------------|
| 03-10 | 6 | ✓ VERIFIED | `color.ts` (`decodeColor3`, `linearToSrgb`); `planet.ts:136-137` uploads decoded linear palette uniforms; `planet.glsl.ts:348-349` per-channel `smoothstep(vec3(0), uTerminatorThreshold, ndotl)` with `dot(n, uSunDir)` in object space and additive `uAmbientTint * uAmbient`; `tests/render/color.test.ts` + `planet-shader.test.ts` green |
| 03-11 | 8 | ✓ VERIFIED | `planet-noise.ts` mirrors the shader and calibrates from the compiled seed; `planet.ts:117-151` uploads all calibration uniforms; `planet.glsl.ts:216-285` deep/open/shelf/coast/land/snowline + noise-perturbed polar cap, Lambert relief flattened over water; `planet-noise.test.ts` + `planet-surface.test.ts` green. Shader samples no texture |
| 03-12 | 7 | ✓ VERIFIED | `exposure.ts` is the only writer of `outputColorSpace`/`toneMapping`/`toneMappingExposure` (`applyOutputContract`, called at `boot.ts:86`); `system-scene.ts:256-261` uses `DISPLAY_SUN_INTENSITY` and `pi * ambient_level`; `station.ts:118-150` reads GLB extras and reproduces the authored per-channel product; `exposure.test.ts` + `station.test.ts` green |
| 03-13 | 5 | ✓ VERIFIED | `viewport.ts` (`aspectOf`, `applyViewport`) is the only `camera.aspect` writer; `scene-manager.ts:89,118,131` applies it on construction and every `enterMenu`/`enterSystem`; `main.ts:183` and `game-session.ts:435` publish the probe; `viewport.test.ts` + `dispose.test.ts` + `aspect.spec.ts` green |
| 03-14 T1 | 1 | ✓ VERIFIED | `planet.glsl.ts:136-138` defines `SURFACE_OCTAVES 6`, `RELIEF_OCTAVES 1`, `CLOUD_OCTAVES 1`; `planet-noise.ts:40-43,59-60` derives `NOISE_EVAL_BUDGET = 6 + 2*1 + 1 = 9`; the budget test derives and asserts 9 against `BUDGET_CEILING = 9` |
| 03-14 T2 | 1 | ✓ PASSED (override) | The suite is green **29/29**, but the measured message test is ~156 s against the plan's **133 s** 1.3x gate. G-03-3 was accepted as a known issue by explicit user decision (PROJECT.md Key Decisions; `03-UAT.md` gap `status: resolved`). Override 1 |
| 03-14 T3 | 1 | ✓ PASSED (override) | The loop cap is untouched: `src/sim/step.ts` still has `MAX_STEPS_PER_FRAME = 5`, `DT = 1 / 120`, `MAX_FRAME_DELTA = 0.25`, and `tests/render/planet-budget.test.ts` freezes all three. The HUD wait (300 s) and `workers: 2` differ from the plan text by the accepted stabilisation decision. Override 2 |
| 03-14 T4 | 1 | ✓ VERIFIED | The surface field (6 octaves, scale 3.1), palette, per-channel terminator, exposure contract and ice cap are unchanged; cloud coverage is re-derived to the authored 0.26 and measured 0.26001; `RELIEF_SCALE` stays 80 with mean shade 0.8519 / min 0.4636. UAT item 1 (`pass`) accepted the reduced relief/cloud fields on a real GPU |
| 03-14 T5 | 1 | ✓ VERIFIED | `tests/render/planet-budget.test.ts` (16 tests) rejects a raised octave count, a fourth `fbm(` tap, a removed sea gate, a define sum above the ceiling, an injected `texture2D(`, an extra `valueNoise(`, a raised step cap/DT/delta, a shortened HUD wait/test timeout, and a reduced or removed worker pin |

### Prior Plan Must-Haves (03-01..03-09)

Carried forward from the 2026-11-03 report: 102 plan truth statements reviewed, 101 verified in code plus one manual visual acceptance (03-03, now covered by UAT item 1), 52/52 declared artifacts, and all key links wired. This round regression-checked that body of work with the full container suite (**54 files, 531 unit/integration tests passed**) and the full browser gate (**29/29 passed**); no prior must-have regressed. The only source paths changed since the prior report are the 03-14 planet shader/mirror/budget files; the flight model, launch sequence, HUD drawing, settings and dispose logic were untouched.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | WORLD-06 hyperspace distance/fuel/jump-time math | Phase 6 | ROADMAP Phase 6 requirements explicitly include WORLD-06 |

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | WR-02..WR-07 open code-review warnings | other | Recorded 2026-11-03, predate the gap-closure rounds, not traceable to a Phase 3 requirement, no failing test or reproducible command |
| 2 | WR-10 partial mirror/shader parity | other | Test-quality gap only; `planet-budget.test.ts` now pins the octave/call-site/gate/texture contract, but not the band thresholds |

### Metadata Notes (not verification gaps)

- `ROADMAP.md` still marks `03-14-PLAN.md` as unchecked and describes its superseded 10-evaluation/133 s target. `03-14-SUMMARY.md` is `status: halted` with an addendum recording that the cadence gate is superseded, not met; G-03-3 is resolved as a known issue in `03-UAT.md` and `PROJECT.md`. The code and evidence are consistent; only the roadmap checkbox/description is stale.
- `ROADMAP.md` marks this phase `mode: mvp`, but its goal is a capability statement, not a User Story (`gsd_run query user-story.validate` returns `valid: false`). MVP-mode User Flow Coverage is therefore not applicable; this report uses the standard goal-backward contract over the five roadmap success criteria.

## Required Artifacts

`gsd_run query verify.artifacts` was last run per gap-closure plan; **20/20 artifacts passed** (all exist, all substantive). The prior 52/52 artifacts remain present and are exercised by the passing full suite. The new 03-14 artifact was checked directly:

| Artifact group | Expected | Status | Details |
|----------------|----------|--------|---------|
| `src/render/color.ts`, `src/render/exposure.ts`, `src/render/viewport.ts` | small typed render helpers | ✓ VERIFIED | 87 / 263 / 59 lines; no DOM, no wall clock; imported by their consumers and pinned by tests |
| `src/render/planet-noise.ts`, `src/render/bodies/planet.ts`, `src/render/shaders/planet.glsl.ts` | calibrated procedural planet at budget 9 | ✓ VERIFIED | One `ShaderMaterial`, deterministic seed, 4096-direction calibration, no texture sample; `NOISE_EVAL_BUDGET = 9` derived from the `#define`s |
| `tests/render/planet-budget.test.ts` | budget + delivery-contract guard | ✓ VERIFIED | 452 lines, 16 tests, `BUDGET_CEILING = 9`, negative controls for every branch |
| `src/render/bodies/station.ts`, `src/render/system-scene.ts`, `src/app/boot.ts` | one exposure/lighting contract | ✓ VERIFIED | `applyOutputContract` sole writer; lights derived from Oolite constants; emissive read from GLB extras |
| `src/app/scene-manager.ts`, `src/app/probe.ts`, `src/main.ts`, `src/app/game-session.ts` | aspect on every install + live probe | ✓ VERIFIED | One write site; probe published from the one render path |
| `tests/render/{color,planet-noise,planet-shader,planet-surface,exposure,station,viewport}.test.ts`, `tests/app/dispose.test.ts`, `tests/e2e/aspect.spec.ts` | automated proof | ✓ VERIFIED | 128 render tests (12 files) + 9 dispose unit tests + 3 browser tests pass |
| `playwright.diag.config.ts`, `tests/diag/frame-cost.spec.ts` | diagnostic harness, not a gate | ✓ VERIFIED | `testDir: "./tests/diag"` is outside `playwright.config.ts`'s `./tests/e2e`; neither vitest nor `verify` picks it up |

## Key Link Verification

The plans use free-form `key_links`, so `verify.key-links` parsed 0 structured links. Each was verified manually:

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `g0-s7` palette triple | `uLandColor`/`uSeaColor`/… | `decodeColor3` -> `srgbToLinear` -> `<colorspace_fragment>` | WIRED | `planet.ts:136-137`; test round-trips all seven authored bytes |
| `system.terminatorThresholdVector` | per-channel day factor | `uTerminatorThreshold` -> `smoothstep(vec3(0), threshold, ndotl)` | WIRED | `planet.ts:175`, `planet.glsl.ts:348`; the source guard rejects world-space pairing |
| `system.ambient_level` | night-side floor | `uAmbient` x `(0.8,0.8,1.0)` added outside the day factor | WIRED | `planet.ts:171-172`, `planet.glsl.ts:349` |
| `g0-s7 random_seed` | calibration -> `uSeaBias`/`uNoiseLo`/`uNoiseScale` | `seedToUniform` -> `calibrateSurface` | WIRED | `planet.ts:117,126,146-148`; `planet-surface.test.ts` re-measures from uploaded uniforms |
| `percent_ice` (default 5) | `uPolarCap`/`uPoleValue` | `polar_fraction` -> `(1-ice)*(0.28+0.24*land)` | WIRED | `planet.ts:117-119,149-150`; schema has optional `percent_ice` |
| Oolite 3.75 radiance / 2.484 pre-exposure | `DISPLAY_SUN_INTENSITY` -> `DirectionalLight` | `ooliteReferenceByte` -> derived constant | WIRED | `exposure.ts:181`, `system-scene.ts:256`; `exposure.test.ts` pins 190/255 |
| `ambient_level` | `AmbientLight` | `ambientIntensityFor` = `pi x level` | WIRED | `exposure.ts:196`, `system-scene.ts:258-260` |
| `coriolis.glb` extras | per-material emissive | `GLTFLoader` extras -> `material.userData.oolite` -> normalized colour x intensity | WIRED | Extras present in `public/models/coriolis.glb`; `station.ts:118-150`; `station.test.ts` asserts the exact products |
| `renderer.getSize` | active camera projection | `applyViewport` -> `camera.aspect` -> `updateProjectionMatrix` | WIRED | `scene-manager.ts:89,118,131`; one write site |
| `SceneManager.enterSystem` | aspect before first render | `applyViewport` at install | WIRED | `scene-manager.ts:126-138`; `aspect.spec.ts` swap case |
| active camera aspect | probe | `probe.aspect` published each frame / on resize | WIRED | `game-session.ts:435`, `main.ts:183`; e2e reads it against `innerWidth/innerHeight` |
| shader `#define` octaves | mirror constants | `planet-noise.ts` exports -> `planet-budget.test.ts` source scan | WIRED | `planet.glsl.ts:136-138`; `planet-noise.ts:40-43,59-60`; drift fails the 16-test guard |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `planet.ts` | palette uniforms | compiled `g0-s7` record decoded to linear | Yes | ✓ FLOWING |
| `planet.ts` | calibration uniforms | `calibrateSurface`/`calibrateClouds` over the authored seed | Yes | ✓ FLOWING |
| `planet.ts` | relief/cloud octave counts | shader `#define`s mirrored by `planet-noise.ts` | Yes | ✓ FLOWING |
| `system-scene.ts` | light intensities | `exposure.ts` constants derived from Oolite reference numbers and `ambient_level` | Yes | ✓ FLOWING |
| `station.ts` | emissive | authored GLB `extras.oolite.emissionModulateColorNormalized` | Yes | ✓ FLOWING |
| `scene-manager.ts` / `probe.ts` | `camera.aspect` | live `renderer.getSize` and the active camera | Yes | ✓ FLOWING |

No hollow props, static fallbacks or mock data were found on the rendered paths. The `uLandFraction`/`uCloudFraction` uniforms are declared and supplied but unused (IN-08); they do not feed rendering.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Planet budget + delivery guard | `docker compose run --rm test npx vitest run tests/render/planet-budget.test.ts` | 1 file, **16 passed** | ✓ PASS |
| Planet render suite | `docker compose run --rm test npx vitest run tests/render/planet-budget.test.ts tests/render/planet-noise.test.ts tests/render/planet-surface.test.ts tests/render/planet-shader.test.ts` | 4 files, **55 passed** | ✓ PASS |
| Full render suite | `docker compose run --rm test npx vitest run tests/render` | 12 files, **128 passed** | ✓ PASS |
| Full unit/integration suite | `docker compose run --rm test` | 54 files, **531 passed** (`convict`/guard probes included) | ✓ PASS |
| Full CI gate (lint, typecheck, assets:check, test, build, e2e) | `docker compose run --rm verify` | exit 0; build ok; **29/29 Playwright passed** in 5.0 min | ✓ PASS |
| Message-expiry spec under pinned 2 workers | `docker compose run --rm verify` (included) | **2.6 min** (~156 s), below the 300 s ceiling / 330 s test timeout | ✓ PASS |
| Torus + flight | `docker compose run --rm verify` (included) | `tests/e2e/flight.spec.ts` passed 29.0 s | ✓ PASS |
| Aspect regression in a real browser | `docker compose run --rm verify` (included) | `tests/e2e/aspect.spec.ts` 3/3 passed | ✓ PASS |
| Storage/rebind/pause | `docker compose run --rm verify` (included) | `tests/e2e/settings.spec.ts` 4/4 passed | ✓ PASS |

No browser failure occurred; there is no red gate to explain this round.

## Probe Execution

N/A — no `scripts/*/tests/probe-*.sh` exists and no plan declares a probe. The excluded diagnostic harness (`tests/diag/frame-cost.spec.ts`, `playwright.diag.config.ts`) is a measurement spec, not a phase probe, and `verify` deliberately does not run it.

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WORLD-01 | 03-01, 03-02, 03-10, 03-11 | New game loads Lave with witchpoint, planet, sun, Coriolis at faithful positions/scale | ✓ SATISFIED | `layout.ts` + exact `layout.test.ts` pins + `scene.spec.ts` probe; palette/calibration derived from `g0-s7` |
| WORLD-02 | 03-01, 03-03, 03-04, 03-07, 03-13 | Full extent renders without visible jitter/z-fighting; circles stay circles | ✓ SATISFIED | Single camera-relative path, log depth, polygonOffset/renderOrder, ULP proof; `viewport.ts` + e2e 2222x1000; UAT item 2 pass |
| WORLD-03 | 03-01, 03-03, 03-10, 03-11, 03-12, 03-14 | Starfield, lighting, planet produce a recognisably Oolite-like scene | ✓ SATISFIED | One procedural material, decoded palette, calibrated PlanetMix/polar cap, per-channel terminator, one exposure contract, authored station emissive, noise budget 9; UAT item 1 pass |
| WORLD-04 | 03-01, 03-09 | Scene manager swaps systems without leaking GPU resources | ✓ SATISFIED | `scene-manager.ts` build->swap->dispose + `renderLists.dispose()`; `dispose.spec.ts` non-growth; `dispose.test.ts` asserts aspect on every install |
| WORLD-05 | 03-01, 03-08 | Missing WebGL2 shows a clear fallback | ✓ SATISFIED | `boot.ts` guard, `fallback.ts` visible message; `fallback.spec.ts` three failure modes + normal boot |
| FLGT-01 | 03-01, 03-02, 03-07 | Launch from Coriolis with +10 min clock and launch roll | ✓ SATISFIED | `beginLaunch` +600 once, dock-mouth pose, station-rate roll; `launch.test.ts`; `launch.spec.ts` |
| FLGT-02 | 03-01, 03-04 | Elite pitch/roll only, no yaw, ramped rates | ✓ SATISFIED | `attitude.ts` ramps/caps/damping; no yaw axis; 10 tests |
| FLGT-03 | 03-01, 03-04 | Aristotelian speed cap 350, thrust 160 u/s², no drift | ✓ SATISFIED | `speed.ts` scalar forward integration; derived catalogue values |
| FLGT-04 | 03-01, 03-04 | Torus 32x–1024x, mass-lock, disengage on input | ✓ SATISFIED | `torus.ts` exact factor and predicates; 25 tests + flight e2e |
| FLGT-05 | 03-01, 03-05, 03-07 | HUD crosshair, 25.6 km scanner, compass, aegis, bars, clock, message, condition | ✓ SATISFIED | `draw.ts` exact 11-element set; `projection.ts` 25,600 m; `hud.spec.ts` 3/3 pass including message expiry under the pinned ceiling |
| FLGT-06 | 03-01, 03-06 | Pause, rebind controls, persist settings locally | ✓ SATISFIED | Pause overlay/auto-pause, semantic rebinding, one versioned localStorage blob; `settings.spec.ts` 4/4 |
| FLGT-07 | 03-01, 03-06 | Input flows through an action/command layer | ✓ SATISFIED | `keyboard.ts` -> `InputFrame` + edge `Command`s -> controller; guards prove no sim->input import |
| FLGT-08 | 03-01, 03-04 | `ShipController` seam for later combat/NPC ships | ✓ SATISFIED | `ShipController.update(view, frame)`; fake controller produces the same hash |

**Coverage:** 13/13 phase requirement IDs satisfied; no orphaned requirement mapped to Phase 3. WORLD-06 is not part of Phase 3 (deferred to Phase 6).

## Anti-Patterns and Review Notes

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/e2e/hud.spec.ts` | 207-260 | 300 s wall-clock correctness wait for the message queue; `workers: 2` pinned | ℹ️ INFO (accepted known issue) | G-03-3 resolved by explicit user decision 2026-11-04 (PROJECT.md Key Decisions; `03-UAT.md`). Full suite green 29/29; measured message test ~156 s. This is not a performance claim and not a product change |
| `src/render/shaders/planet.glsl.ts` | 220-221 | `deepSeaColor`/`paleSeaColor` port `Blend` with inverted arguments (WR-08) | ℹ️ INFO (adjudicated pass, UAT 3) | Oolite's deep sea is 0.85x sea; the shader computes 0.15x (near black), and the pale sea is whiter. UAT item 3 inspected it and passed; the residual fidelity risk is accepted, not a code-vs-plan miss |
| `src/render/shaders/planet.glsl.ts`; `src/render/planet-noise.ts` | 259-270; polar mirror | `sin²(latitude)` instead of Oolite's `(latitude/90°)²` (WR-09) | ℹ️ INFO (adjudicated pass, UAT 4) | The cap begins at 49.59 degrees; UAT item 4 inspected two views and judged the caps normal. Accepted |
| `tests/render/planet-surface.test.ts` | 125-131 | Parity suite pins only three band `#define`s (WR-10) | ⚠️ WARNING | Noise constants, `SURFACE_SCALE`, `CLOUD_SCALE`, the 6-octave cap and the ice ramp can drift between mirror and shader while every test stays green. Test-quality gap, not a current rendering defect; `planet-budget.test.ts` narrows it by pinning the octave counts and call sites |
| `src/render/bodies/station.ts` | 102-104, 117-124 | Neutral fallback sets `emissiveIntensity = 1` without a neutral colour (IN-09) | ℹ️ INFO | Only the malformed/missing-extras path; the truth requires no NaN/Infinity/negative, which holds |
| `src/render/color.ts` | 44-48 | `clamp01(NaN)` returns NaN (IN-10) | ℹ️ INFO | A malformed authored colour would upload a NaN uniform; no such value exists in the pinned content |
| `tests/e2e/aspect.spec.ts` | 122-126 | `swapSystem()` is optional-chained, so the swap case can pass without swapping (IN-11) | ℹ️ INFO | The unit `dispose.test.ts` covers the second `enterSystem`; the browser swap assertion is weaker than its name |
| `src/render/shaders/planet.glsl.ts`; `src/render/exposure.ts` | comments | Three doc comments contradict the code (IN-12) | ℹ️ INFO | Comment-only; "eight times" is 20x, "column sums" are row sums, "largest non-saturating byte" is the first clipping byte |

**Debt-marker gate:** no `TBD`, `FIXME` or `XXX` in any file touched by 03-14 or the stabilisation round (`git diff e0367eb -- src tests playwright.config.ts`). **Stub scan:** no placeholder/empty render path; the only "unused" symbols are the documented `uLandFraction`/`uCloudFraction` uniforms (IN-08) and pre-existing dead exports. `src/sim` purity remains enforced and re-proved by the guard tests in the full suite.

## Test Quality Audit

| Test Area | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| `tests/render/planet-budget.test.ts` | WORLD-03 | 16 | 0 | No | Source-scan + negative controls | ✓ Strong — every branch has a mutation control naming its constant |
| `tests/render/{color,planet-shader,planet-surface,planet-noise,exposure,station,viewport}.test.ts` | WORLD-02/03 | 112 | 0 | No | Value/behavioral | ✓ Strong for distributional pins; one string-level pin locks WR-08 in (`planet-shader.test.ts:240-241`) and the parity suite remains partial (WR-10) |
| `tests/app/dispose.test.ts` | WORLD-04, WORLD-02 | 9 | 0 | No | Behavioral | ✓ Strong — asserts aspect after empty/menu/system/second-system installs |
| `tests/e2e/aspect.spec.ts` | WORLD-02 | 3 | 0 | No | Browser/probe | ✓ Strong for 2222x1000 and 16:9; swap case can pass without a swap (IN-11) |
| `tests/diag/frame-cost.spec.ts` | diagnostic only | 1 | 0 | No | Measurement-integrity | ✓ Excluded from the gate by `testDir`; not evidence for any requirement |
| Prior 03-01..03-09 suites | all | 423 | 0 | No | Value/behavioral | ✓ Carried forward; re-run green |

No skipped/disabled requirement tests (`rg "it.skip|describe.skip|test.skip|xit|xdescribe|it.todo|.only"` over the phase test trees finds none). Expected values come from the pinned Oolite 1.93.1-241 snapshot, the authored `g0-s7` record, and measured quantiles; the planet mirror is used as a distribution-level oracle, not a per-sample equality.

## Decision Coverage

All 15 trackable CONTEXT.md decisions are honored by shipped artifacts (`gsd_run query check.decision-coverage-verify` -> `{total: 15, honored: 15, not_honored: []}`). No decision drifted during the gap-closure or stabilisation rounds.

## Human Verification Required

None outstanding. All six UAT items in `03-UAT.md` are `pass` (6/6, 0 issues, 0 pending, 0 skipped, 0 blocked):

1. **Lave visual fidelity after the gap closure** — pass on a real GPU; the user reported no regression after relief 3->1 and cloud 4->1.
2. **Real-GPU aspect check** — pass on a 4K monitor (circular limb, unsquashed Coriolis, circular star paths).
3. **WR-08 sea-band decision** — pass.
4. **WR-09 polar-cap decision** — pass ("looks normal").
5. **Browser-gate decision** — pass; accepted as a known issue with the wait/timeout/worker stabilisation.
6. **Judgment-tier prohibitions** — pass (all ten checked, none violated).

## Prohibitions

Plans 03-10..03-14 declare judgment-tier prohibitions; all were checked against the source and none is violated. UAT item 6 records the explicit human resolution.

| Prohibition | Finding |
|-------------|---------|
| Authored palette never fed as linear light | ✓ Not violated — `color3`/`decodeColor3` is the only palette path |
| Terminator never mixes world-space normal with object-space light | ✓ Not violated — `dot(n, uSunDir)`; `vectorSpaceViolations` guard |
| Planet look never depends on per-machine randomness/wall clock | ✓ Not violated — fixed Fibonacci lattice + FNV seed; no `Math.random`/`Date` |
| No baked texture or extra pass (D-01, D-02) | ✓ Not violated — one `ShaderMaterial`, no `sampler2D`/`texture2D`, no shell |
| No two exposure contracts | ✓ Not violated — `applyOutputContract` is the only writer of tone mapping/colour space/exposure |
| Asset extras validated before use | ✓ Not violated — finite checks, `[0,64]` clamp, neutral fallback |
| One writer of `camera.aspect` | ✓ Not violated — `rg "\.aspect\s*="` finds one write site (`viewport.ts:56`) |
| Degenerate viewport never yields a non-finite projection | ✓ Not violated — `aspectOf` rejects zero/negative/NaN/Infinity; test asserts byte-identical matrix |
| Deep-sea/snowline shapes must remain the plan's | ✓ Not violated — the code matches the plan; the fidelity question was adjudicated pass in UAT 3 |
| Noise budget must not grow | ✓ Not violated — shader sum 9 / mirror `NOISE_EVAL_BUDGET` 9 / `BUDGET_CEILING` 9, all pinned |

## Gaps Summary

No gap remains open. G-03-1 and G-03-2 were already closed in code and proven (palette/terminator/exposure and the aspect fix). G-03-3 is now **resolved as an accepted known issue by explicit user decision**, recorded in `.planning/PROJECT.md` Key Decisions ("Accept the SwiftShader e2e cadence as a known issue", 2026-11-04) and in `03-UAT.md` (`status: resolved` with a `resolution:` line). The stabilisation round raised the message-expiry wait from 150 s to 300 s (test timeout 180 s -> 330 s), added failure diagnostics, and pinned `workers: 2`; `frozenContractViolations` now requires all three literals while still freezing `MAX_STEPS_PER_FRAME = 5`, `DT = 1 / 120` and `MAX_FRAME_DELTA = 0.25`. No `src/` change was made for that decision (`git diff e0367eb -- src/` is empty); the only source change in this phase's gap closure is plan 03-14's 16 -> 9 noise budget, which this report re-verified.

The full CI gate is green: `docker compose run --rm verify` exit 0, 531/531 unit tests, 29/29 Playwright tests (5.0 min). The two 03-14 must-haves that the acceptance decision changed are recorded as `PASSED (override)` rather than VERIFIED, so the deviation is visible rather than silently absorbed. Open review warnings WR-02..WR-07 and WR-10 remain advisories with no deterministic evidence; they do not fail a Phase 3 must-have.

---

_Verified: 2026-11-04T17:28:46Z_
_Verifier: the agent (gsd-verifier)_

## Re-verification (2026-11-04)

This run exists because the previous report (`verified: 2026-11-04T11:30:37Z`, `status: human_needed`) predated the acceptance decision and plan 03-14, so its `covered_digest` no longer matched the tree.

What was re-checked, against the code rather than the summaries:

- **All 13 phase requirements (WORLD-01..05, FLGT-01..08)** were re-confirmed in `src/` and the tests. `src/` is unchanged since commit `e0367eb` for the stabilisation work (`git diff e0367eb -- src/` empty), so the flight/launch/HUD/settings/dispose paths were regression-checked with the full suite rather than re-derived. The 03-14 source changes (`planet.glsl.ts`, `planet-noise.ts`, `planet.ts`) are new since the previous report and were verified here: budget 9, `BUDGET_CEILING = 9`, 16/16 guard tests, 55/55 planet-focused tests, 128/128 render tests.
- **The full browser gate** was re-run end-to-end: `docker compose run --rm verify` exit 0, build ok, **29/29 Playwright passed** in 5.0 min, with the message-expiry spec at 2.6 min under the 300 s ceiling. This is the first green gate recorded with the stabilised configuration.
- **The gap decision** was checked in its recorded homes: `.planning/PROJECT.md` Key Decisions ("Accept the SwiftShader e2e cadence as a known issue") and `03-UAT.md` (6/6 passed, 0 issues, 0 pending; G-03-3 `status: resolved`). The diagnostic evidence in quick task `261104-oif` (loaded frame 369.4 ms, planet fragment ~281 ms / 76 %, `antialias:false` would save ~135 ms, half resolution ~199 ms) supports the acceptance: the cheap fixes would change the approved look, and QUAL-01 is Phase 7.
- **The report is now `passed`** because every roadmap truth and every plan must-have is either VERIFIED or PASSED (override), and the human verification items that previously blocked it are all `pass` in the UAT. The two overrides keep the changed browser-gate configuration explicit.

The fingerprint was regenerated over the changed implementation/evidence files plus this run's evidence set (98 covered inputs), including `tests/e2e/hud.spec.ts`, `playwright.config.ts`, `tests/render/planet-budget.test.ts`, `tests/diag/frame-cost.spec.ts`, `playwright.diag.config.ts`, `src/render/shaders/planet.glsl.ts`, `src/render/planet-noise.ts`, `src/render/bodies/planet.ts`, `03-UAT.md`, `03-REVIEW-DISPOSITION.md` and `PROJECT.md`; the phase's plans and summaries are included by the fingerprint tool itself.
