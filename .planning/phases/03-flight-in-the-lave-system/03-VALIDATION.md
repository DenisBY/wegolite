---
phase: "3"
slug: "flight-in-the-lave-system"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-03"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `03-RESEARCH.md` § Validation Architecture. Rows below name the **implementing** task
> and its wave; the frontmatter and § Validation Sign-Off are reconciled by `03-09` task 3 step 5 as
> the last act of the phase (see "Reconciliation" at the bottom).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (Node `unit` project) + `@playwright/test` 1.64.1 (headless Chromium in the `ci` image) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test` |
| **Full suite command** | `docker compose run --rm verify` |
| **Focused unit** | `docker compose run --rm test npx vitest run <file...>` |
| **Focused e2e** | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/<spec>.ts"` |
| **Probe URL** | `playwright.config.ts` sets a bare `http://127.0.0.1:4173`; specs that need the `?test=1` hook (`flight.spec.ts`, `dispose.spec.ts`) must `page.goto("/?test=1")` themselves |
| **Estimated runtime** | unit ~15 s; full verify ~2–4 min; single e2e ~20–40 s |

---

## Sampling Rate

- **After every task commit:** Run `docker compose run --rm test` (unit + guards).
- **After every plan wave:** Run `docker compose run --rm verify` (lint → typecheck → assets:check → test → build → e2e).
- **Before `/gsd-verify-work`:** Full suite green in-container plus the manual visual rows below.
- **Max feedback latency:** 60 s for unit; focused e2e during development; full verify at wave boundaries.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement(s) | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|----------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 03-01 | 1 | WORLD-01, WORLD-02, WORLD-03, FLGT-01, FLGT-02, FLGT-03, FLGT-05, FLGT-07, FLGT-08 | T-3-01, T-3-03 | finite/derived layout, one sim-owned frame, camera-relative only | unit + e2e | `docker compose run --rm test npx vitest run tests/app/tracer.test.ts`; `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/scene.spec.ts"` | ❌ W0 | ⬜ pending |
| 03-01-T2 | 03-01 | 1 | WORLD-01, WORLD-05 (partial) | T-3-02 | visible boot failure, retired probe contract | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/scene.spec.ts tests/e2e/precision.spec.ts"` | ❌ W0 | ⬜ pending |
| 03-02-T1 | 03-02 | 2 | WORLD-01, FLGT-01, FLGT-03 | T-3-01, T-3-25 | exact Lave numbers, launch-roll sign discrimination | unit | `docker compose run --rm test npx vitest run tests/sim/layout.test.ts tests/content/player-ship.test.ts tests/sim/launch.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-T2 | 03-02 | 2 | FLGT-08 | T-3-08 | single sim-owned InputFrame, layer denials proven | unit + guard | `docker compose run --rm test npx vitest run tests/guards/sim-purity.test.ts tests/guards/content-boundary.test.ts` | ⚠️ extend existing | ⬜ pending |
| 03-03-T1 | 03-03 | 2 | WORLD-03 | T-3-04 | static shader source, clamped uniforms, planet spin | unit + e2e | `docker compose run --rm test npx vitest run tests/render/planet-shader.test.ts`; `tests/e2e/scene.spec.ts` | ❌ W0 | ⬜ pending |
| 03-03-T2 | 03-03 | 2 | WORLD-03 | T-3-05 | star count cap, deterministic array, precision-scene removed | unit + e2e | `docker compose run --rm test npx vitest run tests/render/starfield.test.ts`; `tests/e2e/scene.spec.ts` | ❌ W0 | ⬜ pending |
| 03-03-T3 | 03-03 | 2 | WORLD-02, WORLD-03 | T-3-06 | GLB clone contract, polygonOffset, no absolute placement | unit + e2e | `docker compose run --rm test npx vitest run tests/render/station.test.ts`; `docker compose run --rm verify` | ❌ W0 | ⬜ pending |
| 03-04-T1 | 03-04 | 2 | FLGT-04 | T-3-07 | clamp + mass lock before integrate, mass-lock-free teleport point | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/torus.test.ts`; `tests/e2e/flight.spec.ts` | ❌ W0 | ⬜ pending |
| 03-04-T2 | 03-04 | 2 | FLGT-02, FLGT-03, FLGT-08 | T-3-08 | intent-only seam, finite scalar speed | unit | `docker compose run --rm test npx vitest run tests/sim/flight-attitude.test.ts tests/sim/flight-speed.test.ts tests/sim/flight-cadence.test.ts tests/sim/flight-controller.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-T3 | 03-04 | 2 | WORLD-02, FLGT-04 | T-3-09 | camera-relative only, finite at full extent | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/mass-lock.test.ts tests/sim/torus.test.ts tests/sim/precision.test.ts src/render/camera-relative.test.ts`; `tests/e2e/flight.spec.ts` | ❌ W0 | ⬜ pending |
| 03-05-T1 | 03-05 | 2 | FLGT-05 | T-3-10 | canvas text only, aegis rules in the sim | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/aegis.test.ts tests/hud/projection.test.ts`; `tests/e2e/hud.spec.ts` | ❌ W0 | ⬜ pending |
| 03-05-T2 | 03-05 | 2 | FLGT-05 | T-3-11 | DPR cap, zero-size guard, exact formats | unit + e2e | `docker compose run --rm test npx vitest run tests/hud/format.test.ts`; `tests/e2e/hud.spec.ts` | ❌ W0 | ⬜ pending |
| 03-05-T3 | 03-05 | 2 | FLGT-05 | T-3-10, T-3-12 | message queue on `flightTime`, no hint lifecycle here | unit + e2e | `docker compose run --rm test npx vitest run tests/hud/projection.test.ts tests/hud/format.test.ts`; `docker compose run --rm verify` | ❌ W0 | ⬜ pending |
| 03-06-T1 | 03-06 | 2 | FLGT-06, FLGT-07 | T-3-13, T-3-14 | strict capture scope, persisted rebind, `#pause` route | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/settings.spec.ts"` | ❌ W0 | ⬜ pending |
| 03-06-T2 | 03-06 | 2 | FLGT-06 | T-3-13 | strict schema, no prototype merge, safe fallbacks | unit | `docker compose run --rm test npx vitest run tests/settings/schema.test.ts tests/input/bindings.test.ts` | ❌ W0 | ⬜ pending |
| 03-06-T3 | 03-06 | 2 | FLGT-06, FLGT-07 | T-3-15 | pause freezes clock, no hidden-time replay | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/settings.spec.ts"`; `docker compose run --rm verify` | ❌ W0 | ⬜ pending |
| 03-07-T1 | 03-07 | 3 | FLGT-01, FLGT-05 | T-3-16 | exactly-once clock/skip gate, cockpit handover, decidable camera pose, single `cameraRelative()` path | unit + e2e | `docker compose run --rm test npx vitest run tests/app/launch-sequence.test.ts tests/render/launch-camera.test.ts tests/render/sync.test.ts`; `tests/e2e/launch.spec.ts` | ❌ W0 | ⬜ pending |
| 03-07-T2 | 03-07 | 3 | FLGT-01 | T-3-17 | seeded break pattern, no wall clock | unit + e2e | `docker compose run --rm test npx vitest run tests/app/launch-sequence.test.ts`; `tests/e2e/launch.spec.ts` | ❌ W0 | ⬜ pending |
| 03-07-T3 | 03-07 | 3 | FLGT-04, FLGT-05 | T-3-17, T-3-18 | camera-local dust, allowlisted hints, first-use dismissal | unit + e2e | `docker compose run --rm test npx vitest run tests/render/dust.test.ts`; `tests/e2e/launch.spec.ts`; `docker compose run --rm verify` | ❌ W0 | ⬜ pending |
| 03-08-T1 | 03-08 | 4 | WORLD-05 | T-3-19, T-3-20 | visible fallback, `ready:false`, one `#failure` surface | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/fallback.spec.ts"` | ❌ W0 | ⬜ pending |
| 03-08-T2 | 03-08 | 4 | WORLD-05 | T-3-19, T-3-21 | all failure modes converge, manifest error distinct | unit + e2e | `docker compose run --rm test npx vitest run tests/app/boot.test.ts`; `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/fallback.spec.ts tests/e2e/precision.spec.ts"`; `docker compose run --rm verify` | ❌ W0 | ⬜ pending |
| 03-09-T1 | 03-09 | 5 | WORLD-04 | T-3-22, T-3-23 | gated `?test=1` hooks, non-growth counters | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/dispose.spec.ts"` | ❌ W0 | ⬜ pending |
| 03-09-T2 | 03-09 | 5 | WORLD-04 | T-3-24 | explicit ownership split, idempotent dispose | unit | `docker compose run --rm test npx vitest run tests/app/dispose.test.ts` | ❌ W0 | ⬜ pending |
| 03-09-T3 | 03-09 | 5 | WORLD-04 | T-3-22 | teardown, re-entry, full phase gate | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/dispose.spec.ts"`; `docker compose run --rm verify` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/helpers/lave.ts` — load `g0.json`/`ships.json` with `readFileSync`, build `FlightConfig` + `SystemLayout`, deterministic `scriptedFrame` (no generated JSON imports inside `src/sim`).
- [ ] `tests/sim/layout.test.ts` — exact Lave positions/distances, raw-vector counter-value, station/nav buoy/sun, station orientation (plan 02).
- [ ] `tests/content/player-ship.test.ts` — player template 350/32/1/2/20/70; Coriolis `stationRoll 0.08`, dock `500.2561` (plan 02).
- [ ] `tests/sim/launch.test.ts` — +600 exactly once, dock-mouth pose, launch-roll sign discrimination (plan 02).
- [ ] `tests/sim/flight-attitude.test.ts`, `flight-speed.test.ts`, `torus.test.ts`, `mass-lock.test.ts`, `precision.test.ts`, `flight-cadence.test.ts`, `flight-controller.test.ts` (plan 04).
- [ ] `tests/sim/aegis.test.ts`, `tests/hud/projection.test.ts`, `format.test.ts`; `tests/render/planet-shader.test.ts`, `starfield.test.ts`, `station.test.ts` (plans 03, 05).
- [ ] `tests/app/launch-sequence.test.ts`, `tests/render/launch-camera.test.ts`, `tests/render/sync.test.ts`, `tests/render/dust.test.ts` (plan 07).
- [ ] `tests/app/boot.test.ts` — the injected-invalid-manifest `ContentBoundaryError` proof with a never-called renderer factory (plan 08).
- [ ] `tests/settings/schema.test.ts`, `tests/input/bindings.test.ts` (plan 06).
- [ ] `tests/e2e/helpers/probe.ts` (plan 01) plus `scene.spec.ts`, `flight.spec.ts`, `launch.spec.ts`, `hud.spec.ts`, `settings.spec.ts`, `fallback.spec.ts`, `dispose.spec.ts`.
- [ ] `src/content/ships.ts` + `src/app/probe.ts` (`?test=1` hook) + `src/app/boot-failure.ts` (plan 01); extend `window.__wegolite` additively.
- [ ] No framework install needed — Vitest, Playwright, Chromium already in the `ci` image.
- [ ] Optional goldens `tests/golden/flight-attitude.json`, `flight-launch.json` (versioned replay; never modify `kinematic-probe.json`).

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lave reads as Oolite at a glance | WORLD-03 | Visual fidelity is a judgement; pixel diffing is forbidden and flaky across GPUs | New game, launch, fly toward planet/station at 1080p. Compare planet palette/terminator, sun size, star density, station silhouette to Oolite. Confirm Lave is green/mauve, not an Earth-like blue marble. |
| No visible jitter/z-fighting across the extent | WORLD-02 | Probe proves float64 separation and material offsets, not final raster | Fly witchpoint → station at normal and torus speed. Watch dock opening and station edges at 500 m and 100 km; confirm no shimmer/zipper. Repeat on integrated GPU and a Retina/4K display. |
| Launch cinematic feel and skip | FLGT-01 | Timing/easing is a feel judgement | Launch once: ~2 s break pattern, Cobra sliding out with slot steady, clean handover. Relaunch: any key skips after first viewing; clock still advances exactly 600 s. |
| HUD readability/layout | FLGT-05 | Design-space layout and colour are visual | Check 1280×720, 1920×1080 and an ultrawide window. Crosshair centred; scanner ellipse/tails readable; compass/aegis/bars/clock/message line not clipped; footer disclaimer visible. |
| Torus/dust legibility | FLGT-04 | Motion cue is perceptual | Engage `j` away from station/planet; dust streaks read as speed, scanner stays legible, pitch/roll/speed input disengages. `j` near station shows mass-lock message and does not engage. |
| Real-GPU WebGL2 fallback | WORLD-05 | Synthetic override proves the code path, not a real browser/GPU | Disable hardware acceleration (or use a WebGL2-less browser), load app; fallback message visible, canvas not blank, no unhandled console error. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---

## Reconciliation

The phase does **not** execute against the placeholder state above. `03-09` task 3 step 5 owns the
final reconciliation, performed after the wave-0/task files exist:

1. Flip the frontmatter to `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`.
2. Tick every box in § Validation Sign-Off and set `Approval: complete (automated; manual rows listed)`.
3. Confirm every row in § Per-Task Verification Map names the implementing task and wave (rows were
   rewritten at plan-revision time; re-check them against the plans that actually ran).
4. Confirm no row still promises a behaviour owned by a later wave (the hint lifecycle belongs to
   03-07, not 03-05; the torus teleport uses the mass-lock-free point pinned in 03-04/03-02).
