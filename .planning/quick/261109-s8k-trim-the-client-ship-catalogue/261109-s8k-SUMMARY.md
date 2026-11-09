---
phase: quick-261109-s8k
plan: 261109-s8k
subsystem: content
tags: [performance, load-size, content-build]
status: complete
---

# Quick task 261109-s8k: trim the client ship catalogue

## What changed

- The content build emits `src/content/generated/ships-client.json` with the
  two entries the game reads (`coriolis-station` and
  `oolite_template_cobra3-player`): 15,196 bytes against 706,617 for the
  complete `ships.json`. The built chunk is 15.27 kB (1.92 kB gzip); the
  previous `ships` chunk was about 707 kB.
- `src/content/ships.ts` loads the trimmed file. `ships.json` stays in the
  repository as the compiler's complete output for the golden and the tests.
- `game-session.ts` caches the equipment `Set` on the identity of
  `profile.equipment` instead of rebuilding it on every fixed step.

## Behaviour change

The save allow-list of station keys is built from the client catalogue, so it
now holds `coriolis-station` only. That is the only key this build writes. A
hand-edited save naming another dock-bearing catalogue entry was accepted
before (and then ignored, because the session always uses the Coriolis) and is
now classified as corrupt.

## Verification

Run in Docker:

- `typecheck`, `lint`, `assets:check`: passed.
- `docker compose run --rm test`: 99 files, 1282 tests passed, 1 skipped.
- `scene`, `docking`, `save-load` and `budget` browser specs: 22 passed,
  including the first-load bytes ceiling.

Not run: `verify`, `verify-full` (owner's request), the rest of the e2e suite,
Firefox.

## Not done from the review's performance list

- P4 (stop redrawing while docked or paused): `budget.spec.ts`,
  `engine.spec.ts` and `hyperspace-failure.spec.ts` assert that frames keep
  rendering in those states, and the Firefox cadence gate is measured docked.
  It needs those gates rewritten and the full browser suites re-run.
- P1 (re-encode textures): needs an image encoder dependency in the image, and
  reverses the recorded byte-for-byte texture copy rule (D-20).
- P3 (load galaxy 0 lazily): the eager galaxy 0 is a recorded Phase 2 design
  and `main.ts` reads it synchronously at boot.
- P5 (probe work per frame): not measured to matter; left alone.

`docs/PERFORMANCE.md` load figures were measured on 2026-11-08 and were not
re-measured here.
