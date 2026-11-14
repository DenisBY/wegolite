---
phase: "12"
slug: "inert-ships-and-the-world-lifecycle"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-14"
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit/integration), Playwright 1.64.1 (Chromium; Firefox via e2e-cross) |
| **Config file** | vitest.config.ts, playwright.config.ts |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test; docker compose run --rm verify-full (release gate)` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `docker compose run --rm test npx vitest run <file>` plus lint and typecheck for sim plans
- **After every plan wave:** Run `docker compose run --rm test` (and `verify` for browser-facing plans)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 12-01 | 1 | FOUND-15 | T-12-01, T-12-02 | A throwing think or onEvent is contained: entity keeps its id, ai becomes null (`ai:none`), one `aiFaulted` event, deterministic hash; an `ai: null` entity does not move (D-02) | unit | `docker compose run --rm test npx vitest run tests/sim/world/step.test.ts tests/sim/ai/test-pilot.test.ts tests/sim/world/world-cadence.test.ts tests/sim/world/snapshot.test.ts` | extend | ⬜ pending |
| 12-01-02 | 12-01 | 1 | FOUND-16 | T-12-04 | `spawnEntity` returns a `SpawnResult`; 40 call sites migrated with unchanged expectations | unit | `docker compose run --rm test npx vitest run tests/sim tests/app/session/world-lifecycle.test.ts tests/app/session/tick-parity.test.ts tests/persistence/save-v3.test.ts` | extend | ⬜ pending |
| 12-01-03 | 12-01 | 1 | FOUND-16 | T-12-03, T-12-04 | Nullish or wrong-typed input refused as `malformed`, never thrown; `nextId`, live length and world stream unchanged | unit | `docker compose run --rm test npx vitest run tests/sim/world/spawn-refusal.test.ts tests/sim/world/store.test.ts tests/sim/world/step.test.ts` | ❌ W0 (created first in the task) | ⬜ pending |
| 12-02-01 | 12-02 | 2 | WORLD-16 | T-12-07 | The e2e bundle defaults traffic off; production default on; the URL cannot override it without the hook | unit + browser | `docker compose run --rm test npx vitest run tests/app/session/test-flags.test.ts tests/app/session/tick-parity.test.ts tests/app/session-order.test.ts tests/app/session/world-lifecycle.test.ts`; `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/tick-hook.spec.ts"` | extend | ⬜ pending |
| 12-02-02 | 12-02 | 2 | WORLD-16 | T-12-06, T-12-08 | The traffic-off define never reaches the deployed bundle (contract over configs, compose, Pages) | unit + gate | `docker compose run --rm test npx vitest run tests/contract/container-contract.test.ts tests/app/session/test-flags.test.ts`; `docker compose run --rm verify` | extend | ⬜ pending |
| 12-03-01 | 12-03 | 3 | WORLD-10 | T-12-09, T-12-12 | Ship lock strictly inside 25,600 m, class table, `torusRefused` with "Hyperspeed mass-locked."; no-ship flights unchanged | unit | `docker compose run --rm test npx vitest run tests/sim/world/ship-field.test.ts tests/sim/torus.test.ts tests/sim/mass-lock.test.ts tests/app/session-order.test.ts tests/sim/world/flight-hash-pins.test.ts tests/app/session/tick-parity.test.ts` | ❌ W0 (ship-field.test.ts created first) | ⬜ pending |
| 12-03-02 | 12-03 | 3 | WORLD-10 | T-12-10, T-12-11 | Completing jump inside a ship's blockage radius refused with blocker `ship` and its copy; station first; masses via step options | unit | `docker compose run --rm test npx vitest run tests/sim/world/ship-field.test.ts tests/sim/hyperspace-blockage.test.ts tests/sim/hyperspace.test.ts tests/app/session/hyperspace-controller.test.ts tests/app/session/sim-driver.test.ts tests/app/session-order.test.ts tests/sim/world/flight-hash-pins.test.ts` | extend | ⬜ pending |
| 12-03-03 | 12-03 | 3 | WORLD-10 | — | FIDELITY E-31/E-32 verbatim, decisions recorded, torus todo closed | contract | `docker compose run --rm -v /tmp/wegolite-12-03/oolite:/oolite -e OOLITE_SRC=/oolite test npx vitest run tests/contract/fidelity.test.ts`; `docker compose run --rm test` | extend | ⬜ pending |
| 12-04-01 | 12-04 | 4 | WORLD-15 | T-12-13, T-12-14, T-12-15 | Compiled float32 hull radius on the nine NPC records, schema, golden and drift gate | unit + drift | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/ship-radius.test.ts tools/oolite-ingest/convert/npc-ships.test.ts tools/oolite-ingest/convert/ship-mass.test.ts tests/content/ships-npc.test.ts`; `docker compose run --rm assets npm run assets:check` | ❌ W0 (ship-radius.test.ts created first) | ⬜ pending |
| 12-04-02 | 12-04 | 4 | WORLD-15 | — | NOTICE provenance, FIDELITY E-33, Key Decision | contract | `docker compose run --rm -v /tmp/wegolite-12-04/oolite:/oolite -e OOLITE_SRC=/oolite test npx vitest run tests/contract/fidelity.test.ts tests/compliance.test.ts` | extend | ⬜ pending |
| 12-05-01 | 12-05 | 5 | WORLD-15, WORLD-14 | T-12-16, T-12-17, T-12-18 | Deterministic inert populator at Oolite location codes; ai null, speed 0, spawn tick 0; capped loops; no draws without records (D-01); inert over 600 ticks | unit | `docker compose run --rm test npx vitest run tests/sim/world/placement.test.ts tests/sim/world/populate.test.ts tests/sim/world/step.test.ts` | ❌ W0 (both files created first) | ⬜ pending |
| 12-05-02 | 12-05 | 5 | WORLD-15 | T-12-16 | Lave launch-world golden; all galaxy-0 systems populate 12 with no fallback | unit | `docker compose run --rm test npx vitest run tests/sim/world/populate.test.ts tests/sim/world/placement.test.ts` | extend | ⬜ pending |
| 12-06-01 | 12-06 | 6 | WORLD-15 | T-12-20, T-12-21, T-12-23 | Traffic on: the launch populates 12 ships through the real router; masses in the step options; traffic off draws nothing | unit | `docker compose run --rm test npx vitest run tests/app/session/traffic.test.ts tests/app/session/world-lifecycle.test.ts tests/content/ships-npc.test.ts tests/app/session/sim-driver.test.ts tests/guards/entity-id-scope.test.ts` | ❌ W0 (traffic.test.ts created first) | ⬜ pending |
| 12-06-02 | 12-06 | 6 | WORLD-14, SAVE-08 | T-12-22 | Jump replaces the world deterministically (ids from 101); reload regenerates the same inert world; saved counter equals the regenerated one; mismatch never blocks a load | unit | `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts tests/app/session/tick-parity.test.ts tests/persistence/save-v3.test.ts tests/persistence/save-golden.test.ts tests/guards/entity-id-scope.test.ts` | extend | ⬜ pending |
| 12-06-03 | 12-06 | 6 | WORLD-16 | T-12-20 | Traffic on: launch, manual docking, docking computer as traffic off; torus differs only by ship mass lock | unit + gate | `docker compose run --rm test npx vitest run tests/app/session/traffic-variants.test.ts`; `docker compose run --rm verify` | ❌ W0 (created first) | ⬜ pending |
| 12-07-01 | 12-07 | 7 | WORLD-15 | T-12-27 | Id-free contacts reach the existing scanner; neutral yellow, police purple | unit | `docker compose run --rm test npx vitest run tests/sim/world/contacts.test.ts tests/ui/hud-model.test.ts tests/app/session/render-driver.test.ts tests/hud/projection.test.ts tests/guards/entity-id-scope.test.ts` | ❌ W0 (contacts.test.ts created first) | ⬜ pending |
| 12-07-02 | 12-07 | 7 | WORLD-15 | T-12-24, T-12-25, T-12-26, T-12-28 | Instanced NPC layer owned by the scene, shared cached resources, lazy per-key models with no retry | unit | `docker compose run --rm test npx vitest run tests/render/npc-ships.test.ts tests/app/npc-models.test.ts tests/app/dispose.test.ts tests/app/session/render-driver.test.ts tests/app/asset-cache-npc.test.ts tests/guards/entity-id-scope.test.ts` | ❌ W0 (two files created first) | ⬜ pending |
| 12-07-03 | 12-07 | 7 | WORLD-15, WORLD-16 | — | Opt-in browser spec: 12 entities, draw calls rise and stay at most 50, populated parity, scanner shows a regenerated ship after a reload | browser + gate | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/traffic.spec.ts tests/e2e/tick-hook.spec.ts tests/e2e/budget.spec.ts"`; `docker compose run --rm verify` | ❌ W0 (traffic.spec.ts created in the task) | ⬜ pending |
| 12-08-01 | 12-08 | 8 | WORLD-11 | T-12-29, T-12-30 | In flight the sim steps behind the chart with no input; docked stays frozen; browser clock advances behind the chart | unit + browser | `docker compose run --rm test npx vitest run tests/app/session-order.test.ts tests/app/session/sim-driver.test.ts tests/app/session/tick-parity.test.ts`; `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/hyperspace.spec.ts"` | extend | ⬜ pending |
| 12-08-02 | 12-08 | 8 | WORLD-11 | T-12-31, T-12-32 | Dock or jump behind the chart closes it; `advanceTicks` steps in flight behind it; reset inside a step is safe | unit | `docker compose run --rm test npx vitest run tests/app/game-loop.test.ts tests/app/session/sim-driver.test.ts tests/app/session/chart-controller.test.ts tests/app/session/hyperspace-controller.test.ts tests/app/session-order.test.ts tests/app/session/world-lifecycle.test.ts` | ❌ W0 (game-loop.test.ts created first) | ⬜ pending |
| 12-08-03 | 12-08 | 8 | WORLD-16 | — | Phase gate: existing browser suite green with traffic off (three documented assertion changes), Firefox core loop green | gate | `docker compose run --rm verify-full`; `docker compose run --rm e2e-cross` | existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Each file below is created as the first step of the task that needs it (TDD rows written red first), so no separate Wave 0 plan exists.

- [ ] `tests/sim/world/spawn-refusal.test.ts` — FOUND-16 (12-01-03)
- [ ] `tests/sim/world/ship-field.test.ts` — WORLD-10 (12-03-01)
- [ ] `tools/oolite-ingest/convert/ship-radius.test.ts` — WORLD-15 radius (12-04-01)
- [ ] `tests/sim/world/placement.test.ts`, `tests/sim/world/populate.test.ts` — WORLD-15, WORLD-14 (12-05-01)
- [ ] `tests/app/session/traffic.test.ts` — WORLD-15 wiring (12-06-01)
- [ ] `tests/app/session/traffic-variants.test.ts` — WORLD-16 Vitest half (12-06-03)
- [ ] `tests/sim/world/contacts.test.ts`, `tests/render/npc-ships.test.ts`, `tests/app/npc-models.test.ts` — WORLD-15 (12-07-01, 12-07-02)
- [ ] `tests/e2e/traffic.spec.ts` (`?test=1&traffic=1`) — WORLD-15, WORLD-16 browser half (12-07-03)
- [ ] `tests/app/game-loop.test.ts` — WORLD-11 reset safety (12-08-02)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scanner shows inert ships and mass-lock feels right in a real browser | WORLD-15, WORLD-10 | Visual judgement | Launch with traffic on, check scanner contacts and the mass-lock message |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 12s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
