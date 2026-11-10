---
phase: quick-261110-e8p
plan: 261110-e8p
subsystem: sim
tags: [fidelity, outfitting, save]
status: complete
---

# Quick task 261110-e8p: the Cobra's fourth missile pylon

## What changed

- `MAX_MISSILES` (`src/sim/player/outfitting.ts`) and `MAX_SAVE_MISSILES`
  (`src/persistence/save.ts`) are 4. `NEW_GAME_MISSILES` stays 3.
- F3 shows `Missile (3/4)` on a new game and sells the fourth; `Pylons full`
  appears at 4/4. Removing four missiles nets +1000 dc.
- FIDELITY.md: the "Missile cap" row is `faithful`, and the known-gap note
  about its wording is removed.
- PROJECT.md: a new Key Decisions row supersedes the missile half of "Cap
  missiles at 3 and passenger berths at 7". The Phase 5 research note that
  said not to change the cap is marked superseded.

## Save compatibility

Older saves hold 0..3 missiles and stay valid. A save with four missiles is
rejected as corrupt by a build older than this one; no v1 release exists yet.
The save version is not bumped, because the shape did not change.

## Verification

Run in Docker: `lint` and `typecheck` passed; `docker compose run --rm test`:
103 files, 1372 tests passed, 1 skipped (including the FIDELITY.md contract
test); browser specs `station`, `autosave` and `save-load`: 38 passed.

Not run: the whole gate and Firefox.
