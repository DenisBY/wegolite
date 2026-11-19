# Phase 18 deferred items

Out-of-scope discoveries logged by executors. Not fixed in the plan that found them.

## From 18-10 (player drift)

- **A straddle always resolves in two contact events (pre-existing dock behaviour).** The straddle branch of `stepDocking` (`src/sim/dock/step.ts`) pushes the box only to the mouth plane (`box.min.z` = 0 plus a micron), but the contact proxy's outward face is `contactPort.zMax` = 34.04 m. On the next tick the classifier returns `outside` and the hull SAT pushes the ship out to `zMax`, emitting a second `bounce` (cause `hull`). Its reported `speed` is the outward normal speed (7.89 m/s at rest, 41.49 m/s with a 68 m/s drift), because `respondToContact` reports `|v . n|` whether the ship approaches or leaves. Measured at speed 0, at 68 m/s forward and with a 68 m/s drift: ticks 0 (`straddle`) and 1 (`hull`) every time, then nothing. The drift adds no contact, so 18-10 pins the pair rather than changing the dock path (the zero-drift dock path must stay byte-identical and the dock tests are diff-gated). Decide in a dock-feel review whether the straddle push should clear the proxy face, or the second event should be suppressed.
