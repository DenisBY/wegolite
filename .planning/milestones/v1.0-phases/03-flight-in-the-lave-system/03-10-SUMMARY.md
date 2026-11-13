---
phase: 03-flight-in-the-lave-system
plan: 10
subsystem: render / planet-colour / lighting
tags:
  - srgb
  - colour-space
  - planet-palette
  - terminator
  - glsl
  - world-03
  - g-03-1

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 03's one-sphere procedural planet material, its compiled palette uniforms and the Lave `g0-s7` fixture
  - phase: 02-data-pipeline-content-compiler
    provides: the compiled `g0-s7` record with authored sRGB colours and `terminatorThresholdVector`

provides:
  - src/render/color.ts — srgbToLinear, linearToSrgb, srgbByteToLinear, decodeColor3
  - src/render/bodies/planet.ts — palette uniforms decoded once; uTerminatorThreshold, uAmbientTint
  - src/render/shaders/planet.glsl.ts — per-channel day factor and additive authored ambient
  - tests/render/color.test.ts, tests/render/planet-shader.test.ts — authored-byte, threshold and vector-space pins

affects:
  - plan 03-11 (surface generator rebases on this shader and consumes the decoded palette)
  - plan 03-12 (exposure model reuses src/render/color.ts)
  - WORLD-03 visual acceptance (the numbers the human UAT now confirms)

actuals:
  tokens: 6045
  tasks: 2
  commits: 2
  plan_head_before: 781ccf09ca08571fc944d197575103b67c2fd4bb
  plan_head_after: e0e50e55e6584bbe78605a25e6ede735ccf375b3

tech-stack:
  added: []
  patterns:
    - one explicit sRGB transfer module shared by palette decode and the future exposure model
    - authored-byte round-trip assertions instead of rendered-pixel assertions
    - shader-source guard self-tested against mutated copies so it cannot silently pass

key-files:
  created:
    - src/render/color.ts
    - tests/render/color.test.ts
  modified:
    - src/render/bodies/planet.ts
    - src/render/shaders/planet.glsl.ts
    - tests/render/planet-shader.test.ts

key-decisions:
  - "The palette is decoded to linear light on the CPU through the exact IEC 61966-2-1 curve; <colorspace_fragment> then encodes once on output, so the displayed byte equals Oolite's authored texture byte."
  - "The encode branch cut is the exact image of 0.04045 (0.0031308049535603713), not the published truncated 0.0031308, so the transfer pair is invertible at its own seam with no tolerance relaxation."
  - "The day factor is smoothed per channel against the authored terminator_threshold_vector, so red saturates first (the warm rim) and the geometric edge is 0% lit."
  - "The ambient is added outside the day factor through Oolite's (0.8,0.8,1.0) tint; there is no ambient floor inside the day factor."
  - "Lighting multiplies the final ground+cloud colour (not ground alone), preserving the existing cloud field that plan 03-11 rewrites."

requirements-completed:
  - WORLD-03

coverage:
  - id: D1
    description: "All seven Lave palette uniforms hold linear light and re-encode to the authored bytes (land 92,150,31; sea 150,100,146; polar land 238,232,217; polar sea 253,253,253; polar cloud 241,172,105; cloud 204,204,204; air 0,0,255)."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-shader.test.ts#decodes Lave's palette to linear light exactly once"
        status: pass
    human_judgment: false
  - id: D2
    description: "The sRGB transfer round-trips within 1e-12, cuts at the exact seam image, and decodes Lave's land triple to (0.106539, 0.305653, 0.013455)."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/color.test.ts#round-trips every sample within 1e-12"
        status: pass
      - kind: unit
        ref: "tests/render/color.test.ts#cuts the decode at 0.04045 and the encode at its exact image"
        status: pass
      - kind: unit
        ref: "tests/render/color.test.ts#decodes Lave's land triple to linear light, not pow(x, 2.2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The terminator is per-channel at 0.105/0.18/0.28: 0% lit at NdotL 0, red-first at 0.105, fully lit at 0.28, with the authored ambient added outside the day factor."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-shader.test.ts#uploads the authored per-channel thresholds"
        status: pass
      - kind: unit
        ref: "tests/render/planet-shader.test.ts#is 0% lit at the geometric terminator and saturates red first"
        status: pass
    human_judgment: false
  - id: D4
    description: "NdotL pairs the object-space normal with the object-space sun; a shader-source guard rejects both mixed-space shapes and is proven to fail on two mutated copies."
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-shader.test.ts#keeps the world-space normal out of the sun comparison"
        status: pass
      - kind: unit
        ref: "tests/render/planet-shader.test.ts#evaluates NdotL in one vector space under spin"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual acceptance: flying around Lave shows the authored green/mauve palette, a hard warm-edged terminator and a genuinely dark night side that does not sweep as the planet spins."
    requirement: WORLD-03
    verification: []
    human_judgment: true
    rationale: "Rendered appearance cannot be asserted without a screenshot diff, which this project does not use; the tests pin the numbers the human is asked to confirm."

duration: 5min
completed: 2026-11-04
status: complete
---

# Phase 3 Plan 10: Planet colour space and terminator Summary

**Lave's palette is decoded once to linear light so it re-encodes to Oolite's authored (92,150,31), and the terminator is now Oolite's per-channel threshold with a 0%-lit edge and an additive authored ambient.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-04T10:11:31Z
- **Completed:** 2026-11-04T10:16:07Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Added `src/render/color.ts`, the project's single explicit sRGB transfer (`srgbToLinear`, `linearToSrgb`, `srgbByteToLinear`, `decodeColor3`), Three-free and unit-testable in Node.
- All seven planet palette uniforms are now decoded to linear light on the CPU; their pre-lighting albedo bytes equal the authored `planetinfo` bytes, closing the double encode that displayed land as (162,202,97).
- Replaced the scalar `terminatorSoftness` smoothstep and its `0.1 + 0.9 * day` floor with `smoothstep(vec3(0.0), uTerminatorThreshold, vec3(ndotl))`, driven by the compiled `0.105/0.18/0.28`, and added the authored ambient through `(0.8, 0.8, 1.0)` outside the day factor.
- NdotL now pairs the object-space normal with the object-space sun (closing WR-01), and the air rim is gated on the per-channel lit term.
- The shader-source guard is self-tested against two mutated sources, so a future mixed-space pairing cannot leave the suite green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Palette decoded once** — `166c5b4` (feat)
2. **Task 2: Per-channel terminator in one vector space** — `e0e50e5` (fix)

**Plan metadata:** committed after this summary (docs).

## Files Created/Modified

- `src/render/color.ts` — exact piecewise sRGB transfer; clamps to `[0,1]`; no Three import.
- `src/render/bodies/planet.ts` — `color3()` decodes through `decodeColor3`; `uTerminatorThreshold` and `uAmbientTint` replace `uTerminatorSoftness`; `uAmbient` still comes from `ambient_level`.
- `src/render/shaders/planet.glsl.ts` — object-space `ndotl`, per-channel `dayLight`, ambient added outside the day factor, rim gated on `max(dayLight)`.
- `tests/render/color.test.ts` — round-trip samples, exact seam pins, byte-92 decode and Lave land decode.
- `tests/render/planet-shader.test.ts` — seven authored-byte pins, raw-triple negative control, threshold pin, vector-space guard, 0%-lit/red-first brightness table.

## Decisions Made

- **The palette is decoded once, explicitly.** `THREE.ColorManagement`/`THREE.Color` colour spaces are deliberately not used: the shader's `<colorspace_fragment>` still encodes once on output, and the explicit transfer keeps the contract independent of renderer configuration.
- **The encode cut is the exact image of the decode cut.** Cutting at the truncated `0.0031308` would send the seam sample `0.04045 / 12.92` down the power branch and make the pair non-invertible at its own seam; both cuts are pinned by tests.
- **Lighting multiplies the final ground+cloud colour.** The plan's shorthand writes `ground * (...)`, but the shader's `color` already carries the cloud mix and the scope boundary keeps the cloud field untouched; plan 03-11 explicitly expects the terminator to multiply "the final ground+cloud colour". `ground` alone would have dropped clouds.
- **The night side is additive, not a floor.** `color *= dayLight + uAmbientTint * uAmbient` reproduces Oolite's `totalColor += AMBIENT_LIGHT * ambientColor` on the night side while leaving the geometric edge 0% lit.

## Deviations from Plan

None — plan executed as written. (The ground-vs-ground+cloud reading is recorded under Decisions Made; no scope or behavior outside the plan changed.)

## Issues Encountered

- A GLSL inline comment first used backticks around `uSunDir`/`n` inside the TypeScript template literal, which closed the template and failed the transform. Removed the backticks; no behavior change.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 03-11 depends on this plan: it rebases the surface generator on this decoded palette and per-channel terminator, and must multiply the final ground+cloud colour.
- Plan 03-12 can reuse `src/render/color.ts` for the exposure model instead of re-deriving a transfer.
- Human UAT still needs to confirm the visual read (authored palette, hard warm terminator, dark night side that does not sweep under spin); the tests pin the underlying numbers.

## Self-Check: PASSED
