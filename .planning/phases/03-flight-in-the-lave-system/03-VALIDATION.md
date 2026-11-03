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
> Seeded from `03-RESEARCH.md` § Validation Architecture. Task IDs are filled in once plans exist.

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
| **Estimated runtime** | unit ~15 s; full verify ~2–4 min; single e2e ~20–40 s |

---

## Sampling Rate

- **After every task commit:** Run `docker compose run --rm test` (unit + guards).
- **After every plan wave:** Run `docker compose run --rm verify` (lint → typecheck → assets:check → test → build → e2e).
- **Before `/gsd-verify-work`:** Full suite green in-container plus the manual visual rows below.
- **Max feedback latency:** 60 s for unit; focused e2e during development; full verify at wave boundaries.

---

## Per-Task Verification Map

Task IDs are assigned at plan time; each planned task must map a row here (or add one) before execution.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 1 | WORLD-01 | — | N/A | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/layout.test.ts tests/content/player-ship.test.ts`; `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/scene.spec.ts"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WORLD-02 | — | N/A | unit + e2e | `docker compose run --rm test npx vitest run src/render/camera-relative.test.ts tests/render/station.test.ts`; `tests/e2e/flight.spec.ts` | ⚠️ extend existing | ⬜ pending |
| TBD | TBD | TBD | WORLD-03 | — | N/A | unit + e2e + manual | `docker compose run --rm test npx vitest run tests/render/starfield.test.ts tests/render/planet-shader.test.ts`; `tests/e2e/scene.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WORLD-04 | — | N/A | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/dispose.spec.ts"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WORLD-05 | — | N/A | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/fallback.spec.ts"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FLGT-01 | — | N/A | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/launch.test.ts`; `tests/e2e/launch.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FLGT-02 | — | N/A | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/flight-attitude.test.ts`; `tests/e2e/flight.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FLGT-03 | — | N/A | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/flight-speed.test.ts`; `tests/e2e/flight.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FLGT-04 | — | N/A | unit + e2e | `docker compose run --rm test npx vitest run tests/sim/torus.test.ts tests/sim/mass-lock.test.ts`; `tests/e2e/flight.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FLGT-05 | — | N/A | unit + e2e + manual | `docker compose run --rm test npx vitest run tests/hud/projection.test.ts tests/hud/format.test.ts`; `tests/e2e/hud.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FLGT-06 | — | N/A | unit + e2e | `docker compose run --rm test npx vitest run tests/settings/schema.test.ts tests/input/bindings.test.ts`; `tests/e2e/settings.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | FLGT-07 | — | N/A | unit + guard | `docker compose run --rm test npx vitest run tests/input/bindings.test.ts tests/guards/sim-purity.test.ts tests/guards/content-boundary.test.ts` | ⚠️ guards exist, input test W0 | ⬜ pending |
| TBD | TBD | TBD | FLGT-08 | — | N/A | unit | `docker compose run --rm test npx vitest run tests/sim/flight-controller.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/helpers/lave.ts` — load `g0.json`/`ships.json` with `readFileSync`, build `FlightConfig` + `SystemLayout`, deterministic input log (no generated JSON imports inside `src/sim`).
- [ ] `tests/sim/layout.test.ts` — exact Lave positions/distances, raw-vector behaviour, station/nav buoy/sun, station orientation.
- [ ] `tests/content/player-ship.test.ts` — player template 350/32/1/2/20/70; Coriolis `stationRoll 0.08`, dock `500.2561`.
- [ ] `tests/sim/flight-attitude.test.ts`, `flight-speed.test.ts`, `torus.test.ts`, `mass-lock.test.ts`, `launch.test.ts`, `flight-controller.test.ts`, `flight-cadence.test.ts`.
- [ ] `tests/hud/projection.test.ts`, `format.test.ts`; `tests/render/starfield.test.ts`, `planet-shader.test.ts`, `station.test.ts`.
- [ ] `tests/settings/schema.test.ts`, `tests/input/bindings.test.ts`.
- [ ] `tests/e2e/helpers/probe.ts` plus `scene.spec.ts`, `flight.spec.ts`, `launch.spec.ts`, `hud.spec.ts`, `settings.spec.ts`, `fallback.spec.ts`, `dispose.spec.ts`.
- [ ] `src/content/ships.ts` + `src/app/probe.ts` (`?test=1` hook); extend `window.__wegolite` additively.
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
