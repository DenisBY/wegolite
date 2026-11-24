---
created: 2026-11-18T12:00:00.000Z
title: Wire the HUD ALT bar to the real altitude
area: hud
severity: minor
files:
  - src/render/hud/draw.ts
  - src/app/hud-model.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

The flight HUD draws the ALT bar as a constant 0.92 (`src/render/hud/draw.ts`), although the sim already computes
the altitude dial (`dialAltitude`) that Oolite's `drawAltitudeBar:` shows. The bar therefore never changes near a
planet or the sun. Found while planning the first-use gauge hints (quick task 261118-ioj), which skipped the ALT hint
for this reason.

## Solution

Feed the bar from the sim's altitude dial through the HUD model, as Oolite's `drawAltitudeBar:` does (check its
scale, colour change and the 40,000 m dial in `HeadUpDisplay.m` at the pin), pin it with unit tests, then add the
ALT first-use hint ("ALT: altitude above the planet …") to the hint table from 261118-ioj.
