---
status: diagnosed
phase: 03-flight-in-the-lave-system
source:
  - 03-01-SUMMARY.md
  - 03-02-SUMMARY.md
  - 03-03-SUMMARY.md
  - 03-04-SUMMARY.md
  - 03-05-SUMMARY.md
  - 03-06-SUMMARY.md
  - 03-07-SUMMARY.md
  - 03-08-SUMMARY.md
  - 03-09-SUMMARY.md
started: 2026-11-03T21:10:00Z
updated: 2026-11-04T08:46:29.558Z
---

## Current Test

[testing complete]

## Tests

### 1. Lave reads as Oolite at a glance
expected: New game, launch, and fly toward Lave's planet and station at 1080p. Palette, terminator, sun size, star density and station silhouette read as Oolite — green/mauve planet with polar ice, white sun with a thin corona, sparse stars, recognisable Coriolis.
result: issue
reported: "I guess it shouldn't be like this"
severity: major
evidence:
  - /tmp/orca-paste-1793780723287-fba9c8fa-d8a0-4b29-bf35-30094231b4a0.png
  - /tmp/orca-paste-1793780745422-051ac1bd-e437-4662-a28d-c251a0034162.png
note: Planet renders as a washed-out lime-green sphere with soft blobby continents and no clear polar ice; the Coriolis reads very dark/low-contrast.

### 2. No jitter or z-fighting across the system extent
expected: Fly witchpoint -> station at normal and torus speed; the planet limb, station edges and dock opening stay clean at ~500 m and ~100 km — no visible jitter, shimmer or z-fighting across the ~1.4e6 m extent.
result: issue
reported: "дрожания не наблюдается, но планета вместо круга выглядит как элипс, станция тоже сплюснута и при врашении звезды перемещаются по элипсу вместо круга"
reported_en: "No jitter observed, but the planet looks like an ellipse instead of a circle, the station is also squashed, and when rotating the stars move along an ellipse instead of a circle."
severity: major
note: Viewport in the screenshots is 2222x1000 (~2.22:1). Geometry is non-uniformly scaled — 2D HUD stays circular while the 3D scene is stretched horizontally, so camera/scene aspect does not match the canvas. Also affects test 1's read of the planet.

### 3. Launch cinematic and any-key skip
expected: First launch shows the break pattern, the Cobra sliding out against a steady slot, then a clean cockpit handover. After a reload the second launch skips on any key and still advances the clock by 600 s.
result: pass

### 4. HUD readability at 720p, 1080p and ultrawide
expected: Crosshair centred; scanner ellipse/tails, compass, aegis, bars, clock and message line readable and unclipped; footer disclaimer visible; letterboxing centred.
result: pass

### 5. Torus drive feel and mass lock
expected: Dust streaks read as speed at 32x-1024x; the scanner stays legible; any pilot input disengages; `j` near the station shows the mass-lock message and never engages.
result: pass

### 6. WebGL2 fallback on a real browser/GPU
expected: With hardware acceleration disabled (or a browser without WebGL2), a visible plain-text fallback names WebGL2 and hardware acceleration; the canvas is not blank; the footer disclaimer remains; no unhandled console error.
result: pass
note: Observed text — "Wegolite could not start: Wegolite needs WebGL2. Try a current Chrome, Firefox or Safari with hardware acceleration enabled."

### 7. Terminator stays fixed relative to the sun (WR-01)
expected: Over ~60 s of flight the lit hemisphere stays fixed relative to the sun; the terminator must not sweep across the surface as the planet spins. Code review reports the shader mixes a world-space normal with an object-space sun direction, so the terminator may rotate at twice the planet spin.
result: pass

## Summary

total: 7
passed: 5
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-03-1
  truth: "Lave reads as Oolite at a glance — green/mauve planet with polar ice, visible terminator, white sun with thin corona, sparse stars, recognisable Coriolis."
  status: failed
  reason: "User reported: I guess it shouldn't be like this. Planet renders washed-out lime-green with soft blobby continents and no clear polar ice; Coriolis reads very dark/low-contrast."
  severity: major
  test: 1
  root_cause: "Planet palette is authored in sRGB but consumed as linear light, then encoded to sRGB again (planet.ts:70-74,112-118 + planet.glsl.ts:173-174 + boot.ts:83), so lit land lands on (162,202,97) instead of Oolite's (92,150,31). Terminator uses a symmetric scalar smoothstep at +-0.185 with a 0.1 ambient floor (planet.glsl.ts:159-165) instead of Oolite's per-channel smoothstep(0, 0.105/0.18/0.28, N.L), giving a 55%-bright grey wash with no warm rim. Surface generator is 4-octave value noise whose actual land threshold yields 87.4% land rather than the intended 65%, with no sea depth, coastal shelf, snowline or Lambert terrain shade, and polar ice is a latitude-only smoothstep(0.6,0.95,|n.y|) ignoring percent_ice/polar_fraction. Station uses DirectionalLight 2.5 + AmbientLight 0.1 with NoToneMapping and emissiveIntensity 0.8 vs Oolite's ~3.75 radiance x 2.484 pre-exposure + ACES, making lit Coriolis faces ~64/255 instead of ~190/255."
  artifacts:
    - path: "src/render/bodies/planet.ts"
      issue: "Raw sRGB palette triples fed as linear uniforms; terminator threshold derived from the wrong vector semantics"
    - path: "src/render/shaders/planet.glsl.ts"
      issue: "No sRGB->linear conversion; symmetric scalar terminator; coarse noise model with mis-calibrated land threshold and latitude-only ice"
    - path: "src/render/system-scene.ts"
      issue: "Under-powered directional/ambient lighting contract for the scene"
    - path: "src/app/boot.ts"
      issue: "NoToneMapping + sRGB output with no exposure, so lighting energy cannot reach Oolite levels"
    - path: "src/render/bodies/station.ts"
      issue: "emissiveIntensity 0.8 ignores the authored ~26x emission"
  missing:
    - "Convert the authored planet palette from sRGB to linear before use (or decode in-shader), so colour reaches the encoder once"
    - "Replace the scalar terminator with Oolite's per-channel smoothstep(0, terminatorThreshold.xyz, N.L) and remove the 0.1 ambient floor at the night edge"
    - "Rework the surface generator toward Oolite's PlanetMix model: deep sea darkening, coastal shelf, snowline/peaks, Lambert terrain shade, and a land threshold that actually matches land_fraction"
    - "Drive polar ice from percent_ice/polar_fraction with a noise-perturbed cap instead of a latitude-only wash"
    - "Pick one exposure contract for the scene; make the station's lighting/emissive match it (Oolite HDR path or calibrated LDR), replacing emissiveIntensity 0.8 with the authored modulate factor"
  debug_session: .planning/debug/lave-planet-washed-out.md

- gap_id: G-03-2
  truth: "Geometry keeps a correct aspect ratio across the system extent — the planet limb and station read as circles/spheres, and rotation moves the starfield along circular paths."
  status: failed
  reason: "User reported: no jitter, but the planet looks like an ellipse, the station is squashed, and rotating makes the stars travel along an ellipse instead of a circle."
  severity: major
  test: 2
  root_cause: "Every PerspectiveCamera is constructed with aspect = 1 (scene-manager.ts:52-59, system-scene.ts:224-233, menu-scene.ts:41-46). The only writer of a real aspect is main.ts:170-182 resize(), bound to window.resize and called once at boot against the throwaway empty scene. Starting a game swaps in the system-scene camera (game-session.ts:615) whose aspect stays 1, and only the HUD is resized (game-session.ts:628-629), so the 3D layer is stretched by innerWidth/innerHeight at every non-square viewport (x2.22 at 2222x1000) while the 2D HUD stays circular."
  artifacts:
    - path: "src/main.ts"
      issue: "resize() applies aspect only to the currently active camera, at boot/resize time"
    - path: "src/app/scene-manager.ts"
      issue: "All cameras constructed at aspect 1 and swapped in without reprojection"
    - path: "src/render/system-scene.ts"
      issue: "Flight camera created at aspect 1"
    - path: "src/render/menu-scene.ts"
      issue: "Menu camera created at aspect 1"
    - path: "src/app/game-session.ts"
      issue: "Start installs the new aspect-1 camera and resizes only the HUD"
  missing:
    - "Apply the viewport aspect when a camera is installed, not only on window.resize (e.g. a shared applyViewport(camera) called after every scene swap)"
    - "Add a regression test that asserts the active camera aspect matches the renderer size after entering a scene at a non-1:1 viewport"
  debug_session: .planning/debug/viewport-aspect-distortion.md
