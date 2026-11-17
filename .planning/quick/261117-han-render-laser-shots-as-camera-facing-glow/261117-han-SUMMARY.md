---
phase: quick
plan: 261117-han
subsystem: render
status: complete
tags: [render, laser, shader, combat, oolite-fidelity]
requires:
  - "src/sim/combat/constants.ts LASER_SHOT_DURATION (unchanged)"
  - "laserFired -> shots.add and render-driver shots.update (signatures unchanged)"
provides:
  - "Camera-facing ribbon laser shot layer with a procedural glow ShaderMaterial"
  - "Browser proof that one live shot costs exactly one draw call"
affects:
  - "Phase 17 NPC fire (distant beams stay visible through the 2-px minimum)"
tech-stack:
  added: []
  patterns:
    - "Camera-facing ribbon: side = normalize(cross(b - a, a)) with the camera at the origin"
    - "Band-limited gaussian cross-profile via fwidth, conserving integrated light"
key-files:
  created:
    - tests/e2e/laser-shots.spec.ts
  modified:
    - src/render/bodies/laser-shots.ts
    - tests/render/laser-shots.test.ts
    - tests/app/dispose.test.ts
    - src/render/system-scene.ts
    - CHANGELOG.md
    - .planning/PROJECT.md
decisions:
  - "Laser shots are one camera-facing ribbon per shot with a procedural shader (Oolite widths 3.6/1.8/0.4 m, peaks 0.15/1.5/4.5, 0.09 s life, additive display-space), not Oolite's crossed textured quads"
metrics:
  started: 2026-11-17T11:43:55Z
  completed: 2026-11-17
  duration: ~25 min
  tasks: 3
  files: 7
actuals:
  tokens: 15500
  tasks: 3
  commits: 4
plan_head_before: f511bd4d95ebbe2246831d222f86d71ae0fe28f4
plan_head_after: 6db5bfc1c57047010d059e8336469ec31ffd9032
---

# Quick 261117-han: Render laser shots as a camera-facing glow — Summary

Laser shots are now one camera-facing ribbon quad per shot, shaded by an
untextured ShaderMaterial. It uses Oolite's halo, flare and core widths (3.6,
1.8 and 0.4 m), peaks (0.15, 1.5 and 4.5), colours and 0.09 s life, with
additive display-space blending. On top of that come a shimmer, a
`1 - (age/0.09)^2` fade, soft ends and a band-limited minimum half extent of
2 device pixels. The `createLaserShotLayer` API is unchanged.

## Tasks

| # | Task | Commit(s) | Files |
|---|------|-----------|-------|
| 1 | Ribbon layer + procedural glow shader (TDD tracer) | `c850e89` (RED test), `b45f48f` (GREEN feat) | `tests/render/laser-shots.test.ts`, `src/render/bodies/laser-shots.ts`, `CHANGELOG.md`, `tests/app/dispose.test.ts` |
| 2 | Chromium proof: one call per live shot, none after expiry | `fce90da` | `tests/e2e/laser-shots.spec.ts` |
| 3 | Key Decisions row + scene doc comment | `6db5bfc` | `.planning/PROJECT.md`, `src/render/system-scene.ts` |

## What changed

- `src/render/bodies/laser-shots.ts`:
  - The old 1-pixel line object is replaced by one `THREE.Mesh` over 32
    preallocated quads. The attributes are `position`, `aSide`, `aColor` and
    `aShape` (Float32, `DynamicDrawUsage`), there is a static Uint16 index,
    and the draw range is `live * 6`.
  - `aSide = normalize(cross(b - a, a))` uses the camera-relative ends
    computed in float64. If the camera is on the beam's line or the shot has
    no length, the code falls back to the beam crossed with the world axis
    least aligned with it, or to (1, 0, 0).
  - New exports: `LASER_HALO/FLARE/CORE_HALF_WIDTH`, `LASER_BRIGHTNESS`,
    `LASER_HALO/FLARE/CORE_PEAK`, `LASER_PROFILE_SIGMA`,
    `LASER_MIN_HALF_EXTENT_PX`, `LASER_SHIMMER_DEPTH`, `LASER_TIME_WRAP` and
    `laserShotFade`.
  - `onBeforeRender` reads the drawing-buffer height into `uViewportHeight`,
    and ignores a height of 0 or a non-finite height. `uTime` is set to
    `flightTime % 100`.
  - The shader follows the nebulae pattern: the `logdepthbuf` chunks are
    kept, and there is no `colorspace` or `tonemapping` chunk.
- The unit tests are rewritten: 42 tests, all in Node with no WebGL.
- The e2e spec is new: `tests/e2e/laser-shots.spec.ts`.
- `CHANGELOG.md`: a new `## [Unreleased]` -> `### Changed` bullet that starts
  "Laser shots …".
- `.planning/PROJECT.md`: a Key Decisions row containing "camera-facing
  ribbon".
- `src/render/system-scene.ts`: only the `shots` doc comment changed.

## Gate results

| Check | Where | Result |
|-------|-------|--------|
| RED: `vitest run tests/render/laser-shots.test.ts` at `c850e89` (test only) | local Docker | FAIL as required (33 failed, 9 passed) |
| `vitest run tests/render/laser-shots.test.ts tests/app/dispose.test.ts` | local Docker | PASS (58/58), after each task |
| `typecheck` | local Docker | PASS (exit 0), after each task |
| `lint` | local Docker | PASS (exit 0), after each task |
| Grep gates: no old line class, `ShaderMaterial`, `logdepthbuf_fragment`, `onBeforeRender`, CHANGELOG "Laser shots", "camera-facing ribbon", no "line-segment" in system-scene | local | PASS |
| Scope guard `git diff --quiet f511bd4 -- src/sim src/content src/app NOTICE ASSETS.md public third_party` | local | PASS (clean) |
| `e2e: npm run build:e2e && npx playwright test tests/e2e/laser-shots.spec.ts` | remote, snapshot `fce90da` | PASS, exit=0, elapsed=9s, 1 passed on the first run |
| `verify` | remote, snapshot `6db5bfc` | PASS, exit=0, elapsed=151s (Vitest 218 files / 5594 passed, 10 skipped; e2e smoke subset 27 passed); no flake reruns needed |
| `verify-full` | — | NOT RUN (left to the orchestrator; AGENTS.md names it for render changes, and it adds `combat.spec.ts` and the new spec) |
| 20-seed NPC acceptance run | — | Not applicable (nothing under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` changed) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed a now-redundant type assertion in `tests/app/dispose.test.ts`**
- **Found during:** Task 1 (GREEN). Lint ran before the commit.
- **Issue:** `root` is now typed `THREE.Mesh<BufferGeometry, ShaderMaterial>`,
  so `shots.root.material as THREE.Material` at line 414 failed eslint
  `@typescript-eslint/no-unnecessary-type-assertion`. The plan expected this
  file to pass unchanged. Its tests did pass unchanged, but lint did not.
- **Fix:** Dropped the cast (one line). Test behaviour is unchanged.
- **Files modified:** `tests/app/dispose.test.ts`
- **Commit:** `b45f48f`

**2. [Rule 3 - Formatting] Prettier reformatted `src/render/bodies/laser-shots.ts`**
- **Fix:** Ran `docker compose run --rm lint npx prettier --write` on that
  file before the GREEN commit, as the plan allows.

**3. [Spec robustness, assertions not weakened] Fire loop in the e2e spec**
- **Change:** The plan says to hold A and advance 1 tick. Instead, the spec
  holds A and advances 1 tick at a time until `laserTemp > 0`, with a bound
  of `FIRE_BOUND_TICKS = 5` ticks. Only one shot can fire inside that bound,
  because the pulse laser's period is 61 ticks. The spec also asserts
  `laserTemp === 0` before firing, so the "fired" signal cannot already be
  true before the key is pressed.
- **Why:** If the key is not sampled on the very first tick, the spec still
  works. The assertions that exactly one call is added and that there are no
  errors are unchanged. The remote run passed on its first attempt.

## Known Stubs

None.

## Threat Flags

None. The change adds no network, auth, file or schema surface. T-han-01 and
T-han-02 are mitigated and pinned by unit tests: no reallocation across 200
cycles, no NaN in any attribute, the degenerate side fallback, and the
`uViewportHeight` guard. The browser spec pins exactly one call.

## Human check (end of phase, owner)

In a real-GPU browser (`docker compose up app`), fly out of the station:
1. The fore pulse laser from the cockpit is one soft red beam with a
   white-hot centre. It rises from below the view centre to the crosshair, has
   no second line or wedge, and fades out quickly.
2. A beam laser looks the same in yellow.
3. The shot looks like one beam from the external, aft and side views.
4. A test shooter's beam about 1.5 km away (`?test=1&traffic=1` with the
   combat test pilot) is visible as a thin coloured line. It does not vanish
   or flicker.
5. There is no muzzle flash or impact glow, by design (OD-9).
6. There are no shader errors in the console.

## Self-Check: PASSED

- FOUND: `src/render/bodies/laser-shots.ts`, `tests/render/laser-shots.test.ts`, `tests/e2e/laser-shots.spec.ts`
- FOUND commits in HEAD: `c850e89`, `b45f48f`, `fce90da`, `6db5bfc`
