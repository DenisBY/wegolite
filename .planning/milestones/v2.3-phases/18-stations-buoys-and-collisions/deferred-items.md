# Phase 18 deferred items

Out-of-scope discoveries logged by executors. Not fixed in the plan that found them.

## From 18-10 (player drift)

- **A straddle always resolves in two contact events (pre-existing dock behaviour).** The straddle branch of `stepDocking` (`src/sim/dock/step.ts`) pushes the box only to the mouth plane (`box.min.z` = 0 plus a micron), but the contact proxy's outward face is `contactPort.zMax` = 34.04 m. On the next tick the classifier returns `outside` and the hull SAT pushes the ship out to `zMax`, emitting a second `bounce` (cause `hull`). Its reported `speed` is the outward normal speed (7.89 m/s at rest, 41.49 m/s with a 68 m/s drift), because `respondToContact` reports `|v . n|` whether the ship approaches or leaves. Measured at speed 0, at 68 m/s forward and with a 68 m/s drift: ticks 0 (`straddle`) and 1 (`hull`) every time, then nothing. The drift adds no contact, so 18-10 pins the pair rather than changing the dock path (the zero-drift dock path must stay byte-identical and the dock tests are diff-gated). Decide in a dock-feel review whether the straddle push should clear the proxy face, or the second event should be suppressed.
  status: acknowledged

## From 18-22 (statics browser spec)

- **A test-order race between the purity guards and `tools/ai-harness/dist-check.test.ts` (pre-existing, unrelated to 18-22).** The guards write short-lived probe files such as `src/sim/__purity_ban_queue_microtask.ts` through `tests/guards/sim-probe.ts` (`writeFileSync`, then `rmSync`). The dist-check test "has none in any file under src/ or public/, comments included" lists the tree and then reads each file, so when a probe file is removed between the listing and the read it fails with `ENOENT: no such file or directory, open 'src/sim/__purity_ban_queue_microtask.ts'` (`dist-check.test.ts:184`). Seen once in the remote `verify` at `6bae6ac` (1 failed, 6,975 passed); the rerun is recorded in 18-22-SUMMARY.md. A fix would make the dist-check skip a file that vanished after the listing, or skip the `__purity_` prefix, or run the two files in one worker; it belongs in a tooling quick task, not in a test-only plan.
  status: acknowledged
