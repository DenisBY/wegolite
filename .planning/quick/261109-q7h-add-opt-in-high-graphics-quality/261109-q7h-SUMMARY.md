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
- The High planet shader is derived from the Standard source by five text
  replacements (`highPlanetFragmentShader`):
  - 3 relief octaves and 5 cloud octaves (Standard: 1 and 1);
  - the cloud cut is the alpha ramp of Oolite's `CloudMix` instead of a narrow
    smoothstep, with the ramp's opaque point on the calibrated threshold;
  - the lighting is Oolite's Oren-Nayar diffuse term and 0.7 albedo under the
    terminator factor. Standard has the terminator factor alone, so its day
    side is uniformly bright and its terminator colour band shows at full
    strength;
  - the planet's own air rim is left to the atmosphere shell.
- At High an alpha-blended atmosphere shell 500 m above the surface follows
  `oolite-default-atmosphere.fragment`: thin haze at the disc centre, dense
  toward the limb, a thin coloured rim, nothing on the night side.
- The surface field is untouched, so the continents are the same at both
  levels. The cloud threshold is recalibrated at the High octave count.
- The quality is applied by re-entering the current system, the same path the
  `?test=1` swap uses. The settings are now read before the first scene is
  built.
- Standard is byte-for-byte the previous path: `PLANET_FRAGMENT_SHADER` is used
  unchanged and no shell is created.

## Decisions

- Phase 3 D-02 is revised for High only (PROJECT.md Key Decisions).
- `quality` is written to the settings blob only when it is not `standard`, so
  the default blob keeps the shape older builds accept.
- High is not held to the nine-evaluation budget; it costs 17 worst case.
- The first cut (an additive outer glow, a hard cloud threshold) did not match
  what the owner meant by "volumetric". The owner supplied Oolite screenshots,
  and the second cut ported Oolite's cloud ramp, atmosphere opacity and diffuse
  lighting. `HIGH_SUN_GAIN` (1.9) and `ATMOSPHERE_BRIGHTNESS` (1.0) are
  presentation tuning that stand in for Oolite's light radiance, exposure and
  tone mapping.

## Verification

Run in Docker:

- `docker compose run --rm typecheck`: passed.
- `docker compose run --rm lint`: passed.
- `docker compose run --rm test`: 97 files, 1265 tests passed, 1 skipped.
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test --project=chromium tests/e2e/settings.spec.ts tests/e2e/budget.spec.ts"`:
  9 passed with the final shaders, including the toggle test (no console
  errors at High) and the unchanged Standard budgets.

Not run: `verify` and `verify-full` (owner's request), the rest of the e2e
suite, and Firefox.

## Known gaps

- The owner looked at High on a real GPU after the second cut and judged it
  still not the same as Oolite, and accepted it as a port. Remaining visible
  differences: Oolite bakes a 1024-2048 px texture from Perlin noise with a
  normal map and sea specular; Wegolite evaluates value noise per pixel with a
  one-tap relief and no specular, and has no tone mapping. The coastline
  outline is sharper than Oolite's for the same reason.
- No frame-rate measurement at High.
