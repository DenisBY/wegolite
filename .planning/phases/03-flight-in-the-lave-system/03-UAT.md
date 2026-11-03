---
status: testing
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
updated: 2026-11-03T21:10:00Z
---

## Current Test

number: 1
name: Lave reads as Oolite at a glance
expected: |
  Lave reads green/mauve with polar ice and a visible terminator; the sun is a
  bright white disc with a thin corona; stars are sparse; the Coriolis is a
  recognisable Oolite station — not an Earth-like blue marble.
awaiting: user response

## Tests

### 1. Lave reads as Oolite at a glance
expected: New game, launch, and fly toward Lave's planet and station at 1080p. Palette, terminator, sun size, star density and station silhouette read as Oolite — green/mauve planet with polar ice, white sun with a thin corona, sparse stars, recognisable Coriolis.
result: pending

### 2. No jitter or z-fighting across the system extent
expected: Fly witchpoint -> station at normal and torus speed; the planet limb, station edges and dock opening stay clean at ~500 m and ~100 km — no visible jitter, shimmer or z-fighting across the ~1.4e6 m extent.
result: pending

### 3. Launch cinematic and any-key skip
expected: First launch shows the break pattern, the Cobra sliding out against a steady slot, then a clean cockpit handover. After a reload the second launch skips on any key and still advances the clock by 600 s.
result: pending

### 4. HUD readability at 720p, 1080p and ultrawide
expected: Crosshair centred; scanner ellipse/tails, compass, aegis, bars, clock and message line readable and unclipped; footer disclaimer visible; letterboxing centred.
result: pending

### 5. Torus drive feel and mass lock
expected: Dust streaks read as speed at 32x-1024x; the scanner stays legible; any pilot input disengages; `j` near the station shows the mass-lock message and never engages.
result: pending

### 6. WebGL2 fallback on a real browser/GPU
expected: With hardware acceleration disabled (or a browser without WebGL2), a visible plain-text fallback names WebGL2 and hardware acceleration; the canvas is not blank; the footer disclaimer remains; no unhandled console error.
result: pending

### 7. Terminator stays fixed relative to the sun (WR-01)
expected: Over ~60 s of flight the lit hemisphere stays fixed relative to the sun; the terminator must not sweep across the surface as the planet spins. Code review reports the shader mixes a world-space normal with an object-space sun direction, so the terminator may rotate at twice the planet spin.
result: pending

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
