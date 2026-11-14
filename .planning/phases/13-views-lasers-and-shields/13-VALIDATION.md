---
phase: "13"
slug: views-lasers-and-shields
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-14"
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `13-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (Node project `unit`), fast-check 4.10.2, Playwright 1.64.1 |
| **Config file** | `vitest.config.ts` (coverage floors: `src/sim/**` lines 93, statements 91, functions 97, branches 86; `src/persistence/**` lines 88; `src/content/**` lines 66) |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test` (then `lint`, `typecheck`; `verify` for browser-facing changes) |
| **Estimated runtime** | slow machine; targeted runs preferred |

---

## Sampling Rate

- **After every task commit:** targeted `vitest run` of the touched files, plus `lint` and `typecheck` for pure `src/sim` work
- **After every plan wave:** `docker compose run --rm test` (coverage floors apply), `lint`, `typecheck`, `assets:check` when content changed
- **Before `/gsd-verify-work`:** full suite green; `verify` green (browser-facing code is touched); `verify-full` only per the Gate decision below
- **Max feedback latency:** one targeted Vitest file per task

---

## Gate decision

AGENTS.md assigns `verify-full` to render, input, persistence and network-guard changes, and this phase changes render (13-13), input (13-02) and persistence (13-06) code. The owner's machine is slow (a `verify-full` run takes about 30 minutes), and the owner has not yet decided whether this phase runs `verify-full`: the recorded gate policy in project memory settles it only for Phase 8's D-12 steps (verify-full at split steps 6 and 9), not for Phase 13. Until the owner decides:

- Each plan runs the gates its own `<verification>` lists: targeted Vitest, `lint` and `typecheck` for pure `src/sim`, content and planning plans (13-03, 13-04, 13-05, 13-08, 13-10, 13-15, 13-16), and `verify` once per plan for browser-facing plans (13-01, 13-02, 13-06, 13-07, 13-09, 13-11, 13-12, 13-13, 13-14). No plan runs `verify-full` on its own.
- The phase-close plan 13-14 runs one `docker compose run --rm verify-full` ONLY if the owner confirmed it before execution (a recorded answer in STATE.md, the orchestrator's prompt or this file). Otherwise the executor does not run it and records "verify-full: open, awaiting owner decision" in 13-14-SUMMARY.md and in the sign-off below, and reports it to the orchestrator as an open item. It is never marked passed without a run and never skipped silently.

---

## Per-Task Verification Map

Filled by the planner per task; the requirement-to-test map is in `13-RESEARCH.md` § Validation Architecture (FOUND-17, INPUT-01, CBT-04, CBT-05, CBT-06, CBT-07, DOCK-10, determinism, opt-in smoke).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | FOUND-17 | T-13-01 | refused begin ends the world | controller scenario | `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts tests/app/session/hyperspace-controller.test.ts` | ✅ extend | ⬜ pending |
| 13-01-02 | 01 | 1 | FOUND-17 (IN-01) | — | — | unit | `docker compose run --rm test npx vitest run tests/app/session-order.test.ts` | ✅ extend | ⬜ pending |
| 13-02-01 | 02 | 2 | INPUT-01 | T-13-03 | setView payload closed union | unit | `docker compose run --rm test npx vitest run tests/input/bindings.test.ts tests/input/station-actions.test.ts` | ✅ extend | ⬜ pending |
| 13-02-02 | 02 | 2 | INPUT-01 | T-13-02 | migration rewrites exact legacy only | unit | `docker compose run --rm test npx vitest run tests/settings/schema.test.ts tests/input/bindings.test.ts` | ✅ extend | ⬜ pending |
| 13-02-03 | 02 | 2 | INPUT-01 | — | — | contract + e2e | `docker compose run --rm test npx vitest run tests/contract/readme.test.ts`; `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/settings.spec.ts tests/e2e/station-tabs.spec.ts"` | ✅ extend | ⬜ pending |
| 13-03-01 | 03 | 2 | CBT-07 | T-13-04 | non-finite ray is a miss | scenario | `docker compose run --rm test npx vitest run tests/sim/combat/hit.test.ts` | ❌ W0 | ⬜ pending |
| 13-03-02 | 03 | 2 | CBT-07 | T-13-05 | depth-capped traversal | unit + property | `docker compose run --rm test npx vitest run tests/sim/combat/octree.test.ts tests/sim/combat/hit.test.ts` | ❌ W0 | ⬜ pending |
| 13-04-01 | 04 | 3 | CBT-07 | T-13-07, T-13-08 | strict schema, provenance | gate + unit | `docker compose run --rm assets`; `docker compose run --rm test npx vitest run tests/content/ships-hulls.test.ts` | ❌ W0 | ⬜ pending |
| 13-04-02 | 04 | 3 | CBT-07 | T-13-06 | depth, node and size caps | unit | `docker compose run --rm test npx vitest run tests/content/ships-hulls.test.ts tools/oolite-ingest/convert/ship-hulls.test.ts` | ❌ W0 | ⬜ pending |
| 13-05-01 | 05 | 3 | CBT-05 | — | — | unit + scenario | `docker compose run --rm test npx vitest run tests/sim/combat/constants.test.ts tests/sim/combat/weapons.test.ts` | ❌ W0 | ⬜ pending |
| 13-05-02 | 05 | 3 | CBT-06 | T-13-09 | non-finite damage ignored | unit | `docker compose run --rm test npx vitest run tests/sim/combat/shields.test.ts` | ❌ W0 | ⬜ pending |
| 13-05-03 | 05 | 3 | DOCK-10, CBT-06 | T-13-09 | sanitizeCombat repairs | unit | `docker compose run --rm test npx vitest run tests/sim/combat/state.test.ts` | ❌ W0 | ⬜ pending |
| 13-06-01 | 06 | 3 | CBT-05 | T-13-10 | strict mount enum | unit | `docker compose run --rm test npx vitest run tests/persistence/save-v4.test.ts` | ❌ W0 | ⬜ pending |
| 13-06-02 | 06 | 3 | CBT-05 | T-13-11, T-13-12 | laser keys refused in equipment; size cap | unit + golden | `docker compose run --rm test npx vitest run tests/persistence/ tests/sim/player-profile.test.ts` | ❌ W0 | ⬜ pending |
| 13-07-01 | 07 | 3 | CBT-07 | T-13-14 | energy sanitised before hash | unit | `docker compose run --rm test npx vitest run tests/sim/world/store.test.ts tests/sim/world/sanitize.test.ts tests/sim/world/hash.test.ts tests/sim/world/flight-hash-pins.test.ts` | ✅ extend | ⬜ pending |
| 13-07-02 | 07 | 3 | CBT-07 | T-13-13 | strict snapshot v2 | unit | `docker compose run --rm test npx vitest run tests/sim/world/snapshot-codec.test.ts tests/sim/world/snapshot.test.ts` | ✅ extend | ⬜ pending |
| 13-07-03 | 07 | 3 | CBT-07 | — | — | unit + golden | `docker compose run --rm test npx vitest run tests/sim/world/populate.test.ts tests/app/session/traffic.test.ts tests/sim/world/flight-hash-pins.test.ts tests/app/session/tick-parity.test.ts` | ✅ extend | ⬜ pending |
| 13-08-01 | 08 | 4 | CBT-05, CBT-07 | T-13-15 | non-finite amount rejected | scenario | `docker compose run --rm test npx vitest run tests/sim/combat/step.test.ts tests/sim/flight-controller.test.ts` | ❌ W0 | ⬜ pending |
| 13-08-02 | 08 | 4 | CBT-04, DOCK-10, CBT-06 | T-13-16 | forged view ignored | scenario | `docker compose run --rm test npx vitest run tests/sim/combat/step.test.ts tests/sim/combat/aim.test.ts tests/sim/combat/dock-reset.test.ts` | ❌ W0 | ⬜ pending |
| 13-08-03 | 08 | 4 | CBT-07 (D-01, A6) | T-13-17 | queued, ordered damage | scenario + pins | `docker compose run --rm test npx vitest run tests/sim/world/flight-hash-pins.test.ts tests/sim/combat/step.test.ts tests/sim/world/hash.test.ts` | ✅ extend | ⬜ pending |
| 13-09-01 | 09 | 4 | CBT-05 | T-13-18 | allow-listed laser path | scenario | `docker compose run --rm test npx vitest run tests/app/session/station-controller.test.ts` | ✅ extend | ⬜ pending |
| 13-09-02 | 09 | 4 | CBT-05 | T-13-18, T-13-19 | forged keys refused; credit checks | unit | `docker compose run --rm test npx vitest run tests/sim/player/outfitting.test.ts tests/ui/station-outfitting.test.ts tests/app/session/station-controller.test.ts` | ✅ extend | ⬜ pending |
| 13-09-03 | 09 | 4 | CBT-05 | — | — | unit | `docker compose run --rm test npx vitest run tests/ui/station-status.test.ts` | ✅ extend | ⬜ pending |
| 13-10-01 | 10 | 5 | CBT-07, CBT-06 | T-13-20 | fire only for the actor | scenario | `docker compose run --rm test npx vitest run tests/sim/combat/npc-fire.test.ts tests/sim/world/control.test.ts` | ❌ W0 | ⬜ pending |
| 13-10-02 | 10 | 5 | CBT-07 | T-13-21 | queue bounded and drained | scenario + cadence | `docker compose run --rm test npx vitest run tests/sim/ai/test-pilot.test.ts tests/sim/world/world-cadence.test.ts tests/sim/world/snapshot-codec.test.ts` | ✅ extend | ⬜ pending |
| 13-11-01 | 11 | 6 | CBT-05, CBT-07 | T-13-23, T-13-24 | mounts from profile only | scenario | `docker compose run --rm test npx vitest run tests/app/session/sim-driver.test.ts tests/app/session/start-session.test.ts` | ✅ extend | ⬜ pending |
| 13-11-02 | 11 | 6 | CBT-07 (D-01) | — | — | parity + e2e measurement | `docker compose run --rm test npx vitest run tests/app/session/tick-parity.test.ts tests/app/session/save-controller.test.ts tests/content/ships-hulls.test.ts tests/app/session/probe-publisher.test.ts`; `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/traffic.spec.ts"` | ✅ extend | ⬜ pending |
| 13-12-01 | 12 | 7 | CBT-06 | — | — | unit | `docker compose run --rm test npx vitest run tests/ui/hud-model.test.ts` | ✅ extend | ⬜ pending |
| 13-12-02 | 12 | 7 | CBT-05, INPUT-01 | T-13-25 | message flood throttled | unit | `docker compose run --rm test npx vitest run tests/app/session-order.test.ts tests/app/dock-feedback.test.ts tests/app/session/save-controller.test.ts` | ✅ extend | ⬜ pending |
| 13-13-01 | 13 | 8 | CBT-04 | — | — | unit | `docker compose run --rm test npx vitest run tests/render/launch-camera.test.ts` | ✅ extend | ⬜ pending |
| 13-13-02 | 13 | 8 | CBT-05 | T-13-26 | bounded shot pool | unit | `docker compose run --rm test npx vitest run tests/render/laser-shots.test.ts tests/render/npc-ships.test.ts` | ❌ W0 | ⬜ pending |
| 13-13-03 | 13 | 8 | INPUT-01 (D-03 frame) | T-13-26 | null on non-finite projection | unit | `docker compose run --rm test npx vitest run tests/hud/projection.test.ts tests/ui/hud-model.test.ts` | ✅ extend | ⬜ pending |
| 13-14-01 | 14 | 9 | CBT-07, CBT-06 | T-13-27, T-13-28 | hook taints session; no id in probe | scenario + opt-in e2e | `docker compose run --rm test npx vitest run tests/sim/ai/test-spawn.test.ts tests/app/probe-shape-compare.test.ts`; `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts tests/e2e/probe-shape.spec.ts"` | ❌ W0 | ⬜ pending |
| 13-14-02 | 14 | 9 | all (Pitfall 14) | — | — | contract | `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts` (and with `OOLITE_SRC`) | ✅ extend | ⬜ pending |
| 13-14-03 | 14 | 9 | all (criterion 5) | — | — | full gates | `docker compose run --rm test`; `docker compose run --rm assets npm run assets:check`; `docker compose run --rm verify`; `verify-full` only per the Gate decision below | ✅ | ⬜ pending |
| 13-15-01 | 15 | 6 | INPUT-01 (ident) | T-13-22, T-13-30 | id cleared at world boundaries | scenario | `docker compose run --rm test npx vitest run tests/sim/combat/ident.test.ts tests/sim/combat/ tests/guards/entity-id-scope.test.ts` | ❌ W0 | ⬜ pending |
| 13-15-02 | 15 | 6 | INPUT-01 (D-03, D-04 pending owner confirmation) | — | — | contract | `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts` | ✅ | ⬜ pending |
| 13-16-01 | 16 | 2 | CBT-07 | T-13-29 | strict NPC record | gate + unit | `docker compose run --rm assets`; `docker compose run --rm test npx vitest run tests/content/ships-npc.test.ts` | ✅ extend | ⬜ pending |
| 13-16-02 | 16 | 2 | CBT-07 | T-13-29 | unknown weapon fails the build | unit + gate | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts`; `docker compose run --rm assets npm run assets:check` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sim/combat/{constants,weapons,shields,state,octree,hit,aim,step,dock-reset,npc-fire,ident}.test.ts` — new (plans 13-03, 13-05, 13-08, 13-10, 13-15)
- [ ] `tests/content/ships-hulls.test.ts`, `tools/oolite-ingest/convert/ship-hulls.test.ts` and `tests/golden/content/ships-hulls.json` — new artifact and golden digest (plan 13-04; the module is named `ships-hulls` so the sim's `**/content/ships*` lint denial covers it)
- [ ] `tests/render/laser-shots.test.ts`, `tests/sim/ai/test-spawn.test.ts` — new (plans 13-13, 13-14)
- [ ] `tests/persistence/save-v4.test.ts`, goldens `tests/golden/save/v4-from-v1-phase4.json`, `v4-from-v1-phase5.json`, `v4-from-v2-phase10-inflight.json` (plan 13-06)
- [ ] `tests/e2e/combat.spec.ts` — opt-in smoke, traffic off by default
- [ ] regenerate `tests/golden/world/inert-lave-epoch1.json` (plan 13-07) and the NPC record golden (plan 13-16) once each, deliberately; never `flight-hash-pins.json`
- [ ] update pinned tests: `tests/sim/world/control.test.ts`, `tests/e2e/probe-shape.spec.ts`, `tests/ui/hud-model.test.ts`, `tests/contract/fidelity.test.ts`

---

## Manual-Only Verifications

All phase behaviors have automated verification (at least 90 % Vitest scenarios; one opt-in browser smoke).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] `verify-full`: result recorded (owner confirmed before execution) or "open, awaiting owner decision" (Gate decision)

**Approval:** pending
