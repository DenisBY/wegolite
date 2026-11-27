---
created: 2026-11-27T18:30:00.000Z
title: Light ships and stations from the sun's colour (Oolite derives the sun light's diffuse and specular from it)
source: Phase 22.1 owner decision D-C, 2026-11-27
area: render
severity: minor
files:
  - src/render/system-scene.ts
  - src/render/exposure.ts
  - tests/app/dispose.test.ts
  - FIDELITY.md
---

## Problem

Wegolite lights every ship and every main station, the Coriolis included, with one white directional
light (`new THREE.DirectionalLight(0xffffff, DISPLAY_SUN_INTENSITY)` in `src/render/system-scene.ts`),
and the dust has a fixed colour. Oolite derives the sun light from the sun's colour: `-[OOSunEntity
setSunColor:]` (`src/Core/Entities/OOSunEntity.m:85-101` at 7437f22) blends 30 % white into the colour,
sets the light's diffuse to `0.5 * (1 + channel)` (paler) and its specular to the channel itself, so a
red sun tints the hulls and a blue one cools them.

Phase 22.1 gave every system its own station model and left this out by owner decision D-C of
2026-11-27 (PROJECT.md Key Decisions, the Phase 22.1 row): the absence does not depend on the station
kind, because ships and all three station types are lit white today.

The divergence is recorded in FIDELITY.md ("Ships and the main station are lit by a white sun light, not
by the sun's colour (owner decision D-C)").

## Solution

1. Do it together with, or after, `.planning/todos/pending/2026-11-27-tone-mapping-vs-oolite-aces.md`
   (todo `2026-11-27-tone-mapping-vs-oolite-aces`): both re-derive the calibrated sun intensity
   (`DISPLAY_SUN_INTENSITY`, `src/render/exposure.ts`) and move the visual goldens in every system, so
   one measured re-pin serves both.
2. Compute the light colour (diffuse and specular) from the system's sun colour exactly as `setSunColor:`
   does, with Oolite's blend, and check whether Oolite colours the dust from it too, keeping the one-directional-light
   contract of `src/render/exposure.ts` (the colour changes, the intensity scale stays the calibrated one
   or is re-derived under the tone-mapping decision).
3. Measure against the reference Oolite container at a red, a yellow and a blue sun (Lave land, a hull
   face, a station face); commit only the numbers, never screenshots.
4. Replace the tripwire in `tests/app/dispose.test.ts` (the white-light assertion of "lights the scene
   with one calibrated directional and one ambient light", which names this todo) with a test of the
   tinted light, and change the FIDELITY.md row to `faithful` or record what remains different.

Tripwire: `tests/app/dispose.test.ts` asserts that the scene's one directional light is white
(`0xffffff`). Lighting from the sun's colour fails it, which forces this todo to be read. It passes
today because nothing changed the light; it is a forward tripwire, not evidence of anything.
