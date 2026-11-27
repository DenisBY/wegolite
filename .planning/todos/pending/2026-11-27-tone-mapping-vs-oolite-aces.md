---
created: 2026-11-27T12:00:00.000Z
title: Measure Wegolite's calibrated-LDR exposure against Oolite's ACES final pass and decide the tone mapping
area: render
severity: medium
files:
  - src/render/exposure.ts
  - src/render/color.ts
  - tests/render/exposure.test.ts
  - FIDELITY.md
  - .planning/PROJECT.md
---

## Problem

Oolite 1.93 tone-maps the whole frame in a final pass: `oolite-final.fragment` applies `ACESFilm`
(`:187-215`, selected at `:817-819`), and the default SDR tone mapper is ACES
(`MyOpenGLView.m:257`, `sdr-tone-mapper` default `OOSDR_TONEMAPPER_ACES`; `Universe.m:492-496` builds the
pass). Wegolite renders with `NoToneMapping` and one sRGB encode, calibrated so one sample (the lit Coriolis
face, byte 190) matches Oolite (PROJECT.md Key Decisions, "Calibrated-LDR exposure contract", Phase 3).

Concerns, owner question 2026-11-27:

- The Phase 3 reason ("ACES would shift Lave's authored land and sea bytes") compares against the authored
  palette, but Oolite shows that palette after ACES too, so the unshifted palette is not what Oolite displays.
- A one-point calibration matches brightness at one value only; ACES compresses highlights and shifts
  saturated colours, so the sun, explosions, nebulae, planet and bright hull texels likely differ from Oolite.
- The divergence has no FIDELITY.md row (the fidelity rule of 2026-11-21 postdates the decision).

## Solution

1. With the reference Oolite container (`tools/oolite-reference/run-remote.sh`), capture a fixed scene
   (Lave, after launch, fixed view) and read 8-bit values at several points: Lave land, sea and polar white,
   the lit and shaded Coriolis faces, the sun disc and its halo, a nebula, an explosion if reachable.
   Capture the same points in Wegolite with `NoToneMapping` and with ACES (Three r187
   `ACESFilmicToneMapping`, exposure set so the Coriolis face still lands on Oolite's byte). Commit only the
   numbers (a fixture), never the screenshots.
2. Decide from the numbers which contract is closer to Oolite overall, with the reviewer models; record it in
   PROJECT.md Key Decisions (superseding the Phase 3 row if it changes).
3. Either way add a FIDELITY.md row for the tone-mapping contract against `oolite-final.fragment`.
4. If ACES wins: change `applyOutputContract`, re-derive `DISPLAY_SUN_INTENSITY`, and re-pin the visual
   goldens it moves (cause measured, Node = browser).

Do it after Phase 22.1, not inside it: the switch moves visual goldens in every system.

Tripwire: `tests/render/exposure.test.ts` already pins `NoToneMapping`; any change to the tone mapping
fails it, which forces this todo to be read.
