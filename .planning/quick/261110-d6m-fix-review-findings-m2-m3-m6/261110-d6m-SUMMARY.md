---
phase: quick-261110-d6m
plan: 261110-d6m
subsystem: app
tags: [persistence, settings, release]
status: complete
---

# Quick task 261110-d6m: fix review findings M2, M3 and M6

## What changed

- **M3.** `start()` is now a guard around `startSession()`: any throw is
  logged, shown with `showBootFailure` and published with `publishFailure`.
  `clearSaveForNewGame()` moved from before the asset preload to after the
  dock-port load, the last step that can fail, and still commits before the
  docked screen appears.
- **M2.** `saveSettings` reads the stored blob at every write and writes
  nothing over one from a newer build. `resetSettings` still removes it.
- **M6.** `pages.yml` is triggered by a completed `verify` run on `main`, runs
  only when that run succeeded for a push, and checks out the commit the run
  verified. `workflow_dispatch` stays as the manual override.
- **M5** is accepted by the owner and unchanged; recorded in PROJECT.md.

Also in this commit set: a dated status section in the review file, four
backlog todos and three v2 requirements moved out of the review's gameplay
suggestions.

## Verification

Run in Docker:

- `docker compose run --rm verify-full`: lint, typecheck, `assets:check`, 103
  unit files and 1370 tests passed; Chromium browser suite 115 passed, 1
  failed.
- The failure was this task's own new test, "a New game that fails to start
  leaves the committed save in place": it installed the failing model route
  after the reload, but the title screen already preloads the models, so the
  game started normally. The route is now installed before the reload.
- After that fix: the new test, the two neighbouring clear tests and the
  oversized-future-blob test with `--repeat-each=2`: 8 passed; `scene.spec.ts`
  (with the new ship-catalogue failure test): 4 passed.
- `docker compose run --rm e2e-cross` (Firefox): 2 passed.

Not run again after the test fix: the whole gate. Not exercised at all: the
new `pages.yml` trigger, which only GitHub can run; the first push to `main`
will show whether the deploy follows `verify`.
