---
created: 2026-11-11T09:00:00.000Z
title: Check CI after 0.2.0 and the Shift+C docking test timeout
area: testing
severity: major
files:
  - tests/e2e/docking.spec.ts:594-650
  - .github/workflows/pages.yml
  - .github/workflows/verify.yml
---

## Problem

Handoff note from the session that ended on 2026-11-11.

1. The GitHub `verify` run for the 0.2.0 release push (run 42894361647, head
   `084c0c3`, tag `v0.2.0` on `8f58325`) failed: 115 passed, 1 failed. The
   failure was `tests/e2e/docking.spec.ts:594` "Shift+C beyond the station aegis
   stays in flight and says why": `page.waitForFunction` timed out after 30 s
   waiting for the HUD message "Too far from the station" (line 644).
2. Because `pages.yml` now follows a successful `verify`, the Pages deploy for
   that push was skipped. The published site was not updated to 0.2.0 by it.
3. A newer push (`f7843ac`, the navigation buoy) started another `verify` run.
   Its result was not read before the session ended.

The cause of the timeout is not known. Locally the test passed in every full
run, including `verify-full` on `f7843ac` (116 passed). The release commits did
not touch flight code. A runner-load flake is the guess; it is not verified.
Phase 7 plan 07-11 recorded five Chromium timeouts under load on CI before.

## Solution

1. `gh run list --limit 5`: read the `verify` result for `f7843ac` and whether
   `pages` ran after it.
2. If it is green, the site is current (0.2.0 plus the buoy). Still treat the
   docking test as flaky: read the failed run's log
   (`gh run view 42894361647 --log-failed`) and look for a race between the
   `?test=1` `setPosition`/`setSpeed` call and the Shift+C key press, in the
   same way the docked-screen races of quick task 261110-a3k were found (a key
   or a probe read racing the loop frame). Do not just raise the timeout.
3. If it fails on the same test again, it is not a one-off: fix it before
   anything else, and decide with the owner whether `v0.2.0` needs a patch
   release, since its tagged commit has a red CI run.
