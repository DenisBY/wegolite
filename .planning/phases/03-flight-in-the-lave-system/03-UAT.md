---
status: complete
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
  artifacts: []
  missing: []

- gap_id: G-03-2
  truth: "Geometry keeps a correct aspect ratio across the system extent — the planet limb and station read as circles/spheres, and rotation moves the starfield along circular paths."
  status: failed
  reason: "User reported: no jitter, but the planet looks like an ellipse, the station is squashed, and rotating makes the stars travel along an ellipse instead of a circle."
  severity: major
  test: 2
  artifacts: []
  missing: []
