---
created: 2026-11-20T17:30:00.000Z
title: Decide whether a dock straddle should resolve in one contact event instead of two
area: sim
severity: low
files:
  - src/sim/dock/step.ts
  - tests/sim/flight-drift.test.ts
  - .planning/phases/18-stations-buoys-and-collisions/deferred-items.md
---

## Problem

Found by plan 18-10 (logged in the Phase 18 `deferred-items.md`), pre-existing dock behaviour. The straddle
branch of `stepDocking` (`src/sim/dock/step.ts`) pushes the ship's box only to the mouth plane (`box.min.z`
= 0 plus a micron), but the contact proxy's outward face is `contactPort.zMax` = 34.04 m. On the next tick
the classifier returns `outside` and the hull SAT pushes the ship out to `zMax`, emitting a second `bounce`
(cause `hull`). Its reported `speed` is the outward normal speed (7.89 m/s at rest, 41.49 m/s with a 68 m/s
drift), because `respondToContact` reports `|v . n|` whether the ship approaches or leaves. Measured at speed
0, at 68 m/s forward and with a 68 m/s drift: ticks 0 (`straddle`) and 1 (`hull`) every time, then nothing.
18-10 pinned the pair rather than change the dock path (the zero-drift dock path must stay byte-identical
and the dock tests are diff-gated).

## When to act

In a dock-feel review, or when anything consumes the `bounce` event's count or speed (a sound, a HUD
message, a damage rule). Decide whether the straddle push should clear the proxy face, or the second event
should be suppressed; either moves the dock pins.
