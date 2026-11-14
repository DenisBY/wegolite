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
| 12-01-01 | 12-01 | 1 | FOUND-16 | T-12-04 | `spawnEntity` returns a `SpawnResult`; 40 call sites migrated atomically with unchanged expectations | unit | `docker compose run --rm test npx vitest run tests/sim tests/app/session/world-lifecycle.test.ts tests/app/session/tick-parity.test.ts tests/persistence/save-v3.test.ts`; `docker compose run --rm typecheck` | extend | ⬜ pending |
| 12-01-02 | 12-01 | 1 | FOUND-16 | T-12-04 | `idExhausted` and `storeFull` named in a fixed order; counter, live array and world stream unchanged on refusal | unit | `docker compose run --rm test npx vitest run tests/sim/world/store.test.ts`; `docker compose run --rm test` | extend | ⬜ pending |
| 12-02-01 | 12-02 | 2 | FOUND-15 | T-12-01, T-12-02 | A throwing think or onEvent is contained: entity keeps its id, ai becomes null (`ai:none`), one `aiFaulted` event, deterministic hash; an `ai: null` entity does not move (D-02; the two listed D-02 consequences applied) | unit | `docker compose run --rm test npx vitest run tests/sim/world/step.test.ts tests/sim/ai/test-pilot.test.ts tests/sim/world/world-cadence.test.ts tests/sim/world/snapshot.test.ts` | extend | ⬜ pending |
| 12-02-02 | 12-02 | 2 | FOUND-16 | T-12-03, T-12-05 | Nullish or wrong-typed input refused as `malformed`, never thrown; `nextId`, live length and world stream unchanged | unit | `docker compose run --rm test npx vitest run tests/sim/world/spawn-refusal.test.ts tests/sim/world/store.test.ts tests/sim/world/step.test.ts` | ❌ W0 (created first in the task) | ⬜ pending |
| 12-02-03 | 12-02 | 2 | FOUND-15, FOUND-16 | — | Key Decisions rows for D-04 and FOUND-16, row (d) amended for D-02; full suite with coverage | gate | `docker compose run --rm test`; `docker compose run --rm lint`; `docker compose run --rm typecheck` | existing | ⬜ pending |
| 12-03-01 | 12-03 | 3 | WORLD-16 | T-12-07 | The e2e bundle defaults traffic off; production default on; the URL cannot override it without the hook (tick-hook inert-flags case boots `traffic=1`) | unit + browser | `docker compose run --rm test npx vitest run tests/app/session/test-flags.test.ts tests/app/session/sim-driver.test.ts tests/app/session-order.test.ts tests/app/session/world-lifecycle.test.ts`; `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/tick-hook.spec.ts"` | extend | ⬜ pending |
| 12-03-02 | 12-03 | 3 | WORLD-16 | T-12-06, T-12-08 | The traffic-off define never reaches the deployed bundle (contract over configs, compose, Pages) | unit + gate | `docker compose run --rm test npx vitest run tests/contract/container-contract.test.ts tests/app/session/test-flags.test.ts`; `docker compose run --rm verify` | extend | ⬜ pending |
| 12-04-01 | 12-04 | 4 | WORLD-10 | T-12-09, T-12-12 | Ship lock strictly inside 25,600 m through `stepSim`, class table; no-ship flights unchanged | unit | `docker compose run --rm test npx vitest run tests/sim/world/ship-field.test.ts tests/sim/torus.test.ts tests/sim/mass-lock.test.ts tests/sim/world/flight-hash-pins.test.ts tests/app/session/tick-parity.test.ts` | ❌ W0 (ship-field.test.ts created first) | ⬜ pending |
| 12-04-02 | 12-04 | 4 | WORLD-10 | T-12-10 | Completing jump inside a ship's blockage radius refused with blocker `ship`; station first with blocker `station`; masses via step options; no src/app change | unit | `docker compose run --rm test npx vitest run tests/sim/world/ship-field.test.ts tests/sim/hyperspace-blockage.test.ts tests/sim/hyperspace.test.ts tests/app/session-order.test.ts tests/app/session/hyperspace-controller.test.ts tests/sim/world/flight-hash-pins.test.ts`; `docker compose run --rm typecheck` | extend | ⬜ pending |
| 12-04-03 | 12-04 | 4 | WORLD-10 | — | FIDELITY E-22 (measured buoy evidence), E-31, E-32 verbatim; WORLD-10 rows incl. the buoy exemption as the owner's decision (2026-11-14, option A) with its revisit todo | contract | `docker compose run --rm -v /tmp/wegolite-12-04/oolite:/oolite -e OOLITE_SRC=/oolite test npx vitest run tests/contract/fidelity.test.ts`; `docker compose run --rm test` | extend | ⬜ pending |
| 12-05-01 | 12-05 | 5 | WORLD-10 | — | Refused torus request emits `torusRefused`; HUD shows "Hyperspeed mass-locked."; running drive keeps "Torus disengaged" | unit | `docker compose run --rm test npx vitest run tests/sim/torus.test.ts tests/sim/mass-lock.test.ts tests/sim/world/ship-field.test.ts tests/app/session-order.test.ts` | extend | ⬜ pending |
| 12-05-02 | 12-05 | 5 | WORLD-10 | T-12-11 | Ship blocker copy; station copy and probe `lastRefusal` shape unchanged; `buildStepOptions` carries `shipMasses` | unit | `docker compose run --rm test npx vitest run tests/app/session/hyperspace-controller.test.ts tests/app/session/sim-driver.test.ts tests/app/session-order.test.ts tests/app/session/world-lifecycle.test.ts` | extend | ⬜ pending |
| 12-05-03 | 12-05 | 5 | WORLD-10 | — | WORLD-10 row completed, changelog, torus todo closed | gate | `docker compose run --rm test`; `docker compose run --rm lint`; `docker compose run --rm verify` | existing | ⬜ pending |
| 12-06-01 | 12-06 | 6 | WORLD-15 | T-12-13, T-12-14, T-12-15 | Compiled float32 hull radius on the nine NPC records, schema, golden and drift gate | unit + drift | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/ship-radius.test.ts tools/oolite-ingest/convert/npc-ships.test.ts tools/oolite-ingest/convert/ship-mass.test.ts tests/content/ships-npc.test.ts`; `docker compose run --rm assets npm run assets:check` | ❌ W0 (ship-radius.test.ts created first) | ⬜ pending |
| 12-06-02 | 12-06 | 6 | WORLD-15 | — | NOTICE provenance, FIDELITY E-33, Key Decision | contract | `docker compose run --rm -v /tmp/wegolite-12-06/oolite:/oolite -e OOLITE_SRC=/oolite test npx vitest run tests/contract/fidelity.test.ts tests/compliance.test.ts` | extend | ⬜ pending |
| 12-07-01 | 12-07 | 7 | WORLD-15, WORLD-14 | T-12-16, T-12-17, T-12-18 | Deterministic inert populator at Oolite location codes; ai null, speed 0, spawn tick 0; capped loops; no draws without records (D-01); a record with a scan class outside `SCAN_CLASSES` dropped before any draw, spawn input typed `SpawnInit` with no assertion; inert over 600 ticks | unit + typecheck | `docker compose run --rm test npx vitest run tests/sim/world/placement.test.ts tests/sim/world/populate.test.ts tests/sim/world/step.test.ts`; `docker compose run --rm lint`; `docker compose run --rm typecheck` | ❌ W0 (both files created first) | ⬜ pending |
| 12-07-02 | 12-07 | 7 | WORLD-15 | T-12-16 | Lave launch-world golden; all galaxy-0 systems populate 12 with no fallback | unit | `docker compose run --rm test npx vitest run tests/sim/world/populate.test.ts tests/sim/world/placement.test.ts` | extend | ⬜ pending |
| 12-08-01 | 12-08 | 8 | WORLD-15 | T-12-20, T-12-21, T-12-23 | Traffic on: the launch populates 12 ships through the real router; masses in the step options; traffic off draws nothing; scan class passed through as a string (the populator narrows it); populating requests no NPC model; the src/content/ships-npc.ts header names start-session.ts as the one importer | unit | `docker compose run --rm test npx vitest run tests/app/session/traffic.test.ts tests/app/session/world-lifecycle.test.ts tests/content/ships-npc.test.ts tests/app/session/sim-driver.test.ts tests/guards/entity-id-scope.test.ts` | ❌ W0 (traffic.test.ts created first) | ⬜ pending |
| 12-08-02 | 12-08 | 8 | WORLD-15 | — | Opt-in browser session holds 12 entities (expired tick-hook count updated, the change REQUIREMENTS.md WORLD-16 sanctions, owner 2026-11-14; the WORLD-16 line is not edited); lifecycle and arrival comments current | browser | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/tick-hook.spec.ts"` | extend | ⬜ pending |
| 12-08-03 | 12-08 | 8 | WORLD-15 | — | Start-up load decision recorded, changelog entry; boot path green | gate | `docker compose run --rm test`; `docker compose run --rm lint`; `docker compose run --rm verify` | existing | ⬜ pending |
| 12-09-01 | 12-09 | 9 | WORLD-14 | T-12-33 | Old world not stepped on the jump-commit tick and unreachable after it; destination repopulated deterministically (ids from 101); static bodies keep ids 1-5 and no second buoy is added (Pitfall 17) | unit | `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts tests/guards/entity-id-scope.test.ts` | extend | ⬜ pending |
| 12-09-02 | 12-09 | 9 | SAVE-08 | T-12-22 | Reload regenerates the same inert world; saved counter equals the regenerated one; mismatch never blocks a load; replay populates like the session | unit + browser | `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts tests/app/session/tick-parity.test.ts tests/persistence/save-v3.test.ts tests/persistence/save-golden.test.ts tests/guards/entity-id-scope.test.ts`; `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/tick-hook.spec.ts"` | extend | ⬜ pending |
| 12-09-03 | 12-09 | 9 | WORLD-16 | — | Traffic on: launch, manual docking, docking computer as traffic off; torus differs only by ship mass lock; D-01, same-tick rule and SAVE-08 recorded | unit + gate | `docker compose run --rm test npx vitest run tests/app/session/traffic-variants.test.ts`; `docker compose run --rm test` | ❌ W0 (created first) | ⬜ pending |
| 12-10-01 | 12-10 | 10 | WORLD-15 | T-12-27 | Id-free contacts reach the existing scanner; neutral yellow, police purple | unit | `docker compose run --rm test npx vitest run tests/sim/world/contacts.test.ts tests/ui/hud-model.test.ts tests/app/session/render-driver.test.ts tests/hud/projection.test.ts tests/guards/entity-id-scope.test.ts` | ❌ W0 (contacts.test.ts created first) | ⬜ pending |
| 12-10-02 | 12-10 | 10 | WORLD-15 | — | Shared traffic fixture; a regenerated ship 5 km away is a visible contact; changelog | unit + gate | `docker compose run --rm test npx vitest run tests/ui/hud-model.test.ts tests/sim/world/contacts.test.ts`; `docker compose run --rm verify` | ❌ W0 (traffic-fixture.ts created in the task) | ⬜ pending |
| 12-11-01 | 12-11 | 11 | WORLD-15 | T-12-24, T-12-25, T-12-26, T-12-28, T-12-36 | Instanced NPC layer owned by the scene, shared cached resources, lazy per-key models with no retry; the loader stays closed until the render driver has drawn the first in-flight frame (no fetch in docked or launching frames, none during that frame; DATA-13 kept, owner decision 2026-11-14, option A) | unit | `docker compose run --rm test npx vitest run tests/render/npc-ships.test.ts tests/app/npc-models.test.ts tests/app/dispose.test.ts tests/app/session/render-driver.test.ts tests/app/asset-cache-npc.test.ts tests/guards/entity-id-scope.test.ts` | ❌ W0 (two files created first) | ⬜ pending |
| 12-11-02 | 12-11 | 11 | WORLD-15 | — | Id-holder, model-loading and deferral Key Decisions, changelog; opt-in tick-hook stops in launching with 12 ships and requests no model; traffic-off budget and npc-assets specs unchanged and green | browser + gate | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/tick-hook.spec.ts tests/e2e/budget.spec.ts tests/e2e/npc-assets.spec.ts"`; `docker compose run --rm test`; `docker compose run --rm lint`; `docker compose run --rm verify` | existing | ⬜ pending |
| 12-12-01 | 12-12 | 12 | WORLD-15, WORLD-16 | T-12-34, T-12-35 | Opt-in browser spec: launch gives 12 entities, no GLB during the launch frames, then only present keys' GLBs requested, draw calls rise once models load and stay at most 50, scanner count unchanged by loading, populated browser/Node parity | browser | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/traffic.spec.ts"`; `docker compose run --rm typecheck` | ❌ W0 (traffic.spec.ts created in the task) | ⬜ pending |
| 12-12-02 | 12-12 | 12 | WORLD-15, WORLD-16 | T-12-37 | Traffic-on cold start: zero NPC GLB or texture requests before the first in-flight frame (launch-frame log and page-side fetch stamps), transfer at most 9,437,184 bytes in the browser-test and the production bundle (DATA-13, ROADMAP Phase 9 criterion 3); present models and textures finish within 600 loop frames, calls above the base and at most 50 (counts only) | browser | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/traffic.spec.ts"`; `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/traffic.spec.ts -g 'cold start'"`; `docker compose run --rm typecheck` | extend | ⬜ pending |
| 12-12-03 | 12-12 | 12 | WORLD-15, WORLD-16, SAVE-08 | — | A reload beside a regenerated ship shows it on the scanner with 12 entities; PERFORMANCE traffic-on row, traffic-on cold-start figure and deferral note; row 237 parity status | browser + docs | `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/traffic.spec.ts"`; `docker compose run --rm lint`; `docker compose run --rm typecheck`; `docker compose run --rm test npx vitest run tests/contract/readme.test.ts` | extend | ⬜ pending |
| 12-13-01 | 12-13 | 13 | WORLD-11 | — | A dock behind the chart closes it before the docked context is set | unit | `docker compose run --rm test npx vitest run tests/app/session-order.test.ts tests/app/session/chart-controller.test.ts` | extend | ⬜ pending |
| 12-13-02 | 12-13 | 13 | WORLD-11 | — | An arrival behind the chart closes it; a failed arrival leaves it alone | unit | `docker compose run --rm test npx vitest run tests/app/session/hyperspace-controller.test.ts tests/app/session/chart-controller.test.ts tests/app/session/world-lifecycle.test.ts` | extend | ⬜ pending |
| 12-13-03 | 12-13 | 13 | WORLD-11 | T-12-31 | A reset inside a step is safe (accumulator never negative) | unit + gate | `docker compose run --rm test npx vitest run tests/app/game-loop.test.ts tests/app/session-order.test.ts tests/app/session/sim-driver.test.ts`; `docker compose run --rm verify` | ❌ W0 (game-loop.test.ts created first) | ⬜ pending |
| 12-14-01 | 12-14 | 14 | WORLD-11 | T-12-29, T-12-30 | In flight the sim steps behind the chart with no input; docked stays frozen; browser clock advances behind the chart | unit + browser | `docker compose run --rm test npx vitest run tests/app/session-order.test.ts tests/app/session/sim-driver.test.ts tests/app/session/tick-parity.test.ts tests/app/game-loop.test.ts`; `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/hyperspace.spec.ts"` | extend | ⬜ pending |
| 12-14-02 | 12-14 | 14 | WORLD-11 | T-12-32 | `advanceTicks` steps in flight behind the chart; refuses docked with the chart open; stops on a chart open or close | unit | `docker compose run --rm test npx vitest run tests/app/session/sim-driver.test.ts tests/app/session-order.test.ts tests/app/session/world-lifecycle.test.ts` | extend | ⬜ pending |
| 12-14-03 | 12-14 | 14 | WORLD-16 | — | Phase gate: existing browser suite green with traffic off (three sanctioned assertion changes: owner decision 1 and WORLD-16 twice), the opt-in traffic spec green (render gate for 12-11 and 12-12, including the traffic-on cold start of DATA-13), Firefox core loop green; runs once (about 30 minutes on the owner's machine) | gate | `docker compose run --rm verify-full`; `docker compose run --rm e2e-cross` | existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Each file below is created as the first step of the task that needs it (TDD rows written red first), so no separate Wave 0 plan exists.

- [ ] `tests/sim/world/spawn-refusal.test.ts` — FOUND-16 (12-02-02)
- [ ] `tests/sim/world/ship-field.test.ts` — WORLD-10 (12-04-01)
- [ ] `tools/oolite-ingest/convert/ship-radius.test.ts` — WORLD-15 radius (12-06-01)
- [ ] `tests/sim/world/placement.test.ts`, `tests/sim/world/populate.test.ts` — WORLD-15, WORLD-14 (12-07-01)
- [ ] `tests/app/session/traffic.test.ts` — WORLD-15 wiring (12-08-01)
- [ ] `tests/app/session/traffic-variants.test.ts` — WORLD-16 Vitest half (12-09-03)
- [ ] `tests/sim/world/contacts.test.ts`, `tests/helpers/traffic-fixture.ts` — WORLD-15 scanner (12-10-01, 12-10-02)
- [ ] `tests/render/npc-ships.test.ts`, `tests/app/npc-models.test.ts` — WORLD-15 drawing (12-11-01)
- [ ] `tests/e2e/traffic.spec.ts` (`?test=1&traffic=1`) — WORLD-15, WORLD-16 browser half (12-12-01)
- [ ] `tests/app/game-loop.test.ts` — WORLD-11 reset safety (12-13-03)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scanner shows inert ships and mass-lock feels right in a real browser | WORLD-15, WORLD-10 | Visual judgement | Launch with traffic on, check scanner contacts and the mass-lock message |
| No NPC model request before the cockpit view in the real preview build | WORLD-15 (DATA-13 kept) | A real browser's Network panel on the deployed bundle; automated in tests/e2e/traffic.spec.ts (12-12-02) | `docker compose up preview`, New game, launch: ships on the scanner during the launch, no `models/<npc>.glb` request until the cockpit view appears (plan 12-14 human-check) |

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
