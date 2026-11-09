---
phase: quick-261109-q7h
plan: 261109-q7h
subsystem: render
tags: [quality, planet, atmosphere, shader, settings]
status: complete

key-files:
  created:
    - src/render/bodies/atmosphere.ts
    - src/render/shaders/atmosphere.glsl.ts
    - tests/render/planet-quality.test.ts
  modified:
    - src/settings/schema.ts
    - src/settings/store.ts
    - src/render/planet-noise.ts
    - src/render/shaders/planet.glsl.ts
    - src/render/bodies/planet.ts
    - src/render/system-scene.ts
    - src/app/scene-manager.ts
    - src/app/game-session.ts
    - src/app/probe.ts
    - src/ui/settings-panel.ts
    - index.html
    - tests/settings/schema.test.ts
    - tests/e2e/settings.spec.ts
---

# Quick task 261109-q7h: opt-in High graphics quality

## What changed

- A `quality` setting (`standard` default, `high` opt-in) and a "High-quality
  planet" checkbox in the pause menu's Settings panel.
- At High the planet shader compiles with 3 relief octaves and 4 cloud octaves
  (Standard: 1 and 1). The surface field is untouched, so the continents are
  the same. The cloud threshold is recalibrated at the High octave count.
- At High an atmosphere shell at 1.04 planet radii adds a halo that fades to
  nothing at its outer edge and a narrow haze just inside the limb.
- The quality is applied by re-entering the current system, the same path the
  `?test=1` swap uses. The settings are now read before the first scene is
  built.
- Standard is byte-for-byte the previous path: `PLANET_FRAGMENT_SHADER` is used
  unchanged and no shell is created.

## Decisions

- Phase 3 D-02 is revised for High only (PROJECT.md Key Decisions).
- `quality` is written to the settings blob only when it is not `standard`, so
  the default blob keeps the shape older builds accept.
- High is not held to the nine-evaluation budget; it costs 16 worst case.
- Tuning after the first screenshots: the first shell (haze exponent 8,
  strength 0.9) washed out the lit disc. The shipped values are haze exponent
  24, halo exponent 2.5, strength 0.6 and shell scale 1.04.

## Verification

Run in Docker:

- `docker compose run --rm typecheck`: passed.
- `docker compose run --rm lint`: passed.
- `docker compose run --rm test`: 97 files, 1264 tests passed, 1 skipped.
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test --project=chromium tests/e2e/settings.spec.ts tests/e2e/budget.spec.ts"`:
  9 passed with the shipped tuning values, including the new toggle test (no
  console errors at High) and the unchanged Standard draw-call, triangle and
  first-load budgets.

Not run: `verify` and `verify-full` (owner's request), the rest of the e2e
suite, and Firefox.

## Not verified

- Frame rate at High on a real GPU. The container renders on SwiftShader.
- The look of High beyond two SwiftShader screenshots of Lave from one vantage.
  The shell and relief constants are presentation tuning and may need another
  pass on a real display, in particular for systems whose `air_color` is not
  blue.
