---
phase: 03-flight-in-the-lave-system
plan: 12
subsystem: render / exposure / lighting
tags:
  - exposure
  - tone-mapping
  - calibration
  - emissive
  - coriolis
  - glb-extras
  - world-03
  - g-03-1

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 03-10's one sRGB transfer module (src/render/color.ts) and the planet palette byte pin this plan must not disturb
  - phase: 03-flight-in-the-lave-system
    provides: plan 03-11's calibrated planet surface, whose final colour path is settled before this plan runs
  - phase: 03-flight-in-the-lave-system
    provides: plan 03-13's viewport/aspect contract and the scene-manager install path that renders through these lights
  - phase: 02-data-pipeline-content-compiler
    provides: the compiled coriolis.glb material extras (emissionModulateColorNormalized) and g0-s7 ambient_level 0.1

provides:
  - src/render/exposure.ts — OOLITE_LIGHT_RADIANCE, OOLITE_PREEXPOSURE, OOLITE_REFERENCE_LIT_BYTE, DISPLAY_SUN_INTENSITY, ambientIntensityFor, displayedByteFor, clippingAlbedoByteFor, ooliteReferenceByte, acesReference, applyOutputContract
  - src/app/boot.ts — buildRenderer applies the one output contract
  - src/render/system-scene.ts — the scene's only lights, calibrated; ambientLevel threaded from the compiled record
  - src/render/bodies/station.ts — authored per-channel emissive read from the GLB extras with a validated fallback
  - tests/render/exposure.test.ts, tests/render/station.test.ts, tests/app/dispose.test.ts — numeric proof of the contract

affects:
  - WORLD-03 visual acceptance (the station and planet now share one exposure contract; the human UAT confirms the perceived brightness)
  - any future body added to the system scene (it is lit by the same derived sun intensity; clippingAlbedoByteFor bounds it)

actuals:
  tokens: 7808
  tasks: 2
  commits: 2
  plan_head_before: 8e7d309c638105eda757b3ad79455549da892058
  plan_head_after: 0e2488e8d0a567fa57a310a64c1ffa9ec0d58606

tech-stack:
  added: []
  patterns:
    - one exposure contract derived from Oolite constants, not taste — the free constant is solved from the measured target byte
    - a reference model of the path being replaced (radiance x 3.75, pre-exposure x 2.484, ACES, gamma) proves the chosen LDR target is the same brightness band
    - asset extras are untrusted input — validated, clamped and given a finite neutral fallback before reaching a material
    - the clipping bound is exported per NdotL so every body in the scene is bounded, not just the one that was measured

key-files:
  created:
    - src/render/exposure.ts
    - tests/render/exposure.test.ts
  modified:
    - src/app/boot.ts
    - src/render/system-scene.ts
    - src/render/bodies/station.ts
    - tests/render/station.test.ts
    - tests/app/dispose.test.ts
    - .planning/PROJECT.md

key-decisions:
  - "The contract is calibrated LDR, not ACES: linear light in, NoToneMapping, one sRGB encode, exposure 1. ACES would reproduce Oolite's HDR path but shift Lave's authored palette by several 8-bit levels and compress the polar whites; the LDR path keeps 03-10's palette byte exact and reaches the station target with one light constant."
  - "DISPLAY_SUN_INTENSITY (24.25) is solved from pi * srgbToLinear(190/255) / (srgbByteToLinear(87) * 0.7), replacing the taste-tuned 2.5 that displayed ~64/255. displayedByteFor reproduces the derivation, and the pre-fix value is a discriminated control >100 levels darker."
  - "The planet's gain is 1 by construction because its palette is display-linear after 03-10, so the only free parameter in the contract is the station's light intensity."
  - "Ambient is pi * ambient_level, cancelling three's BRDF_Lambert 1/pi so the displayed ambient is exactly albedo * ambient_level as Oolite's AMBIENT_LIGHT term does."
  - "The scene-wide clipping bound is derived and exported (albedo bytes 101/119/139 at NdotL 1.0/0.7/0.5): the Cobra in the launch cinematic is lit by the same one light, so its highlight is bounded rather than assumed safe because only the station was measured."
  - "Emissive is normalised by its peak so emissive.rgb * emissiveIntensity equals the authored GLB triple per channel exactly; the dock (peak 0.963) does not bloom while hull/faceplate/tris carry the ~26.6x authored gain."
  - "GLB extras are validated before use (finite, three components, positive peak, each clamped to [0,64]) and fall back to a neutral emissive at intensity 1, so a corrupted asset cannot produce NaN/Infinity."

requirements-completed:
  - WORLD-03

coverage:
  - id: D1
    description: "One exposure contract in one module: sRGB encode once, NoToneMapping, exposure 1, applied by buildRenderer through applyOutputContract."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/exposure.test.ts#sets sRGB, no tone map and exposure 1 on a plain object"
        status: pass
      - kind: unit
        ref: "tests/render/exposure.test.ts#never assigns a filmic tone map anywhere in the module"
        status: pass
    human_judgment: false
  - id: D2
    description: "A mean Coriolis face (albedo byte 87, NdotL 0.7) displays 190/255 under DISPLAY_SUN_INTENSITY 24.25; the pre-fix 2.5 displays below 90 and is at least 100 levels darker."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/exposure.test.ts#displays the reference face at 190 +/- 3 under the derived intensity"
        status: pass
      - kind: unit
        ref: "tests/render/exposure.test.ts#keeps the pre-fix intensity at least 100 levels darker (the control)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Oolite's own HDR path (3.75 radiance, 2.484 pre-exposure, ACES, gamma) lands within 20 levels of the reported 190 target and inside [185, 220]."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/exposure.test.ts#computes Oolite's HDR path to within 20 levels of the reported target"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ambient is pi * ambient_level (Lave's 0.1 -> 0.314159), and the assembled scene contains exactly one DirectionalLight at DISPLAY_SUN_INTENSITY and one AmbientLight."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/exposure.test.ts#turns Lave's 0.1 into pi * 0.1"
        status: pass
      - kind: unit
        ref: "tests/app/dispose.test.ts#lights the scene with one calibrated directional and one ambient light"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every Coriolis material's emissive x intensity equals the authored GLB triple per channel; the dock is 0.963, the hull layers 26.592, and malformed/missing extras fall back finite."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/station.test.ts#applies the authored triple per channel on the assembled materials"
        status: pass
      - kind: unit
        ref: "tests/render/station.test.ts#proves the fixture's extras actually reach the material"
        status: pass
      - kind: unit
        ref: "tests/render/station.test.ts#falls back instead of emitting NaN when a component is not finite"
        status: pass
    human_judgment: false
  - id: D6
    description: "The scene-wide clipping bound is pinned at albedo bytes 101/119/139 for NdotL 1.0/0.7/0.5 and the byte at the bound still displays 254-255."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/exposure.test.ts#pins the authored albedo bytes at NdotL 1.0, 0.7 and 0.5"
        status: pass
      - kind: unit
        ref: "tests/render/exposure.test.ts#places the bound where saturation starts, not below it"
        status: pass
    human_judgment: false
  - id: D7
    description: "Visual acceptance: the Coriolis reads as a lit Oolite station (lit faces near 190/255, authored window glow) under the same contract that keeps Lave's palette exact."
    requirement: WORLD-03
    verification: []
    human_judgment: true
    rationale: "Rendered appearance cannot be asserted without a screenshot diff, which this project does not use; the tests pin the 8-bit values the human UAT is asked to confirm."

duration: 6min
completed: 2026-11-04
status: complete
---

# Phase 3 Plan 12: One exposure contract and the lit Coriolis Summary

**The scene now has exactly one exposure contract — linear light, no tone map, one sRGB encode, exposure 1 — with a derived sun intensity of 24.25 that takes a mean lit Coriolis face from ~64/255 to 190/255 and its authored ~26.6x emissive, while Lave's palette byte stays exactly what 03-10 pinned.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-04T10:41:28Z
- **Completed:** 2026-11-04T10:47:07Z
- **Tasks:** 2
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- Added `src/render/exposure.ts`, the single statement of the contract and the only place its free constant is derived: `DISPLAY_SUN_INTENSITY` = π·sRGB(190/255) / (linear(87)·0.7) = 24.255.
- Exported Oolite's reference constants (radiance 3.75, pre-exposure 2.484) and `acesReference`, a faithful scalar port of Three r187's ACES chunk; `ooliteReferenceByte()` returns 208/255, within 20 levels of the UAT's 190 — proving the chosen LDR target and Oolite's HDR path are the same band.
- Exported `displayedByteFor`, `ambientIntensityFor` (π·level) and `clippingAlbedoByteFor` (scene-wide bound: 101/119/139 at NdotL 1.0/0.7/0.5), so the Cobra and every future body are bounded by the same contract as the station.
- `buildRenderer` now calls `applyOutputContract`; `assembleSystemScene` takes `ambientLevel` and creates exactly one directional light at the derived intensity and one ambient at π·0.1, both asserted in Node.
- The Coriolis reads each material's authored `emissionModulateColorNormalized` from the GLB extras after cloning, normalising by the peak so the per-channel product is exact; hull/faceplate/tris carry 26.592 and the dock 0.963, so the dock no longer blooms at hull gain.
- The extras read is validated (finite, three components, positive peak, components clamped to [0,64]) with a neutral intensity-1 fallback, proven by fabricated, missing and NaN-extras tests.
- `.planning/PROJECT.md` § Key Decisions records the calibrated-LDR decision next to 03-10's palette pin.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define and prove the one exposure contract** — `7d315cc` (feat)
2. **Task 2: Apply the contract to renderer, lights and station emissive** — `0e2488e` (feat)

**Plan metadata:** committed after this summary (docs).

## Files Created/Modified

- `src/render/exposure.ts` — the contract paragraph, Oolite constants, ACES reference model, `DISPLAY_SUN_INTENSITY`, display/ambient/clipping maths, `applyOutputContract`.
- `src/app/boot.ts` — `buildRenderer` keeps the DPR cap and delegates output state to `applyOutputContract`.
- `src/render/system-scene.ts` — `assembleSystemScene(parts, sunDir, ambientLevel, scene?, camera?)`; one directional + one ambient, calibrated.
- `src/render/bodies/station.ts` — `applyAuthoredEmissive` replaces `EMISSIVE_INTENSITY = 0.8`; validation and neutral fallback.
- `tests/render/exposure.test.ts` — 17 tests: constants, reference band, calibration, pre-fix control, ambient, clipping pins/monotonicity/boundary, ACES monotonicity, output contract, source scan.
- `tests/render/station.test.ts` — GLB extras reader and node→triple map; synthetic fixture now carries extras; per-channel, fabricated, missing and NaN cases.
- `tests/app/dispose.test.ts` — ambient argument threaded; exactly-one-light assertion.
- `.planning/PROJECT.md` — one Key Decisions row.

## Decisions Made

- **Calibrated LDR over ACES.** The contract reproduces the authored palette exactly and reaches Oolite's station brightness with one derived constant; ACES was numerically rejected because it moves Lave's land/sea and compresses polar whites.
- **The reference model is proof, not the target.** `ooliteReferenceByte()` (208) models the HDR path being replaced; the contract is calibrated to the byte the user reported (190), and both land in one band.
- **The clipping bound is scene-wide and exported.** Rather than measuring only the station, `clippingAlbedoByteFor(ndotl)` states where saturation starts for any body lit by the one sun; the Cobra's highlight is bounded by the same function.
- **Emissive is normalised by peak.** This keeps `emissive × intensity` exactly equal to the authored triple per channel while avoiding colour values above 1.
- **Extras are untrusted.** Validation plus clamp plus finite fallback means a corrupted GLB cannot produce NaN, Infinity or a negative intensity.

## Deviations from Plan

None - plan executed exactly as written. Two test assertions were corrected during the run before commit (the monotonicity direction in the clipping test and a float-comparison precision), neither a deviation from the plan's intent.

## Issues Encountered

- Prettier reformatted `src/render/exposure.ts` (the array/matrix layout) on the first lint run; the file was reformatted in the container and lint re-run green.
- The first version of `ambientIntensityFor(+Infinity)` returned 0 because the shared clamp treated all non-finite input as the minimum; `clamp` now maps only NaN to the minimum and +Infinity to the maximum, matching "clamp to [0,1]".

## Verification

Run in Docker, observed green:

- `docker compose run --rm test npx vitest run tests/render/exposure.test.ts tests/render/station.test.ts tests/app/dispose.test.ts tests/compliance.test.ts` — 4 files, 48 tests passed.
- `docker compose run --rm test npx vitest run tests/render tests/app` — 15 files, 146 tests passed.
- `docker compose run --rm test` — full suite: 53 files, 512 tests passed.
- `docker compose run --rm typecheck` — exit 0, no `error TS` lines.
- `docker compose run --rm lint` — ESLint clean, Prettier "All matched files use Prettier code style!".

## User Setup Required

None.

## Next Phase Readiness

The exposure contract is now the single downstream of every system-scene body; WORLD-03's remaining work is the human UAT confirmation of the perceived station brightness against Oolite, which the tests pin numerically (190/255 lit face, authored emissive).

## Self-Check: PASSED

- `src/render/exposure.ts` — FOUND
- `tests/render/exposure.test.ts` — FOUND
- `src/app/boot.ts`, `src/render/system-scene.ts`, `src/render/bodies/station.ts` — FOUND
- `.planning/PROJECT.md` Key Decisions row — FOUND at line 88
- Commits `7d315cc` (task 1) and `0e2488e` (task 2) — both ancestors of HEAD
