---
phase: "08"
slug: "session-split-and-world-core"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-11"
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit/integration, Node env) and Playwright 1.64.1 (Chromium) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm verify` (per commit/wave); `docker compose run --rm verify-full` (phase gate and split steps 3, 6, 9) |
| **Estimated runtime** | targeted Vitest ~30 s; `verify` several minutes (baseline recorded in Wave 0, D-01) |

---

## Sampling Rate

- **After every task commit:** Run the targeted `docker compose run --rm test npx vitest run <file>` for the files touched; session-split steps run `docker compose run --rm verify` (D-12).
- **After every plan wave:** Run `docker compose run --rm verify`; `verify-full` at split steps 3, 6, 9 and after the integration plan.
- **Before `/gsd-verify-work`:** `docker compose run --rm verify-full` green and `git diff --exit-code -- tests/golden` clean.
- **Max feedback latency:** targeted run under ~60 s; each new browser spec under ~60 s with `workers: 2`.

---

## Per-Task Verification Map

Task IDs are filled in once plans exist. Requirement → test map from RESEARCH.md:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| FOUND-10 | Probe shape unchanged across the split | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/probe-shape.spec.ts"` | ❌ W0 | ⬜ pending |
| FOUND-10 | Redraw-gate and economy-purity scans hold across session sources | unit | `docker compose run --rm test npx vitest run tests/app/redraw-gate.test.ts tests/guards/economy-purity.test.ts` | ✅ (re-point W0) | ⬜ pending |
| FOUND-10 | No golden changed | process | `git diff --exit-code -- tests/golden` | n/a | ⬜ pending |
| FOUND-10 | Frame phase order and event-router subscriber order pinned | unit | `docker compose run --rm test npx vitest run tests/app/session-order.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-10 | Per-controller fake-context unit tests | unit | `docker compose run --rm test npx vitest run tests/app/session` | ❌ per split step | ⬜ pending |
| FOUND-11 | Ids monotonic, never reused, ascending iteration | unit + property | `docker compose run --rm test npx vitest run tests/sim/world/store.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-11 | Fixed id table and static/player views | unit | `docker compose run --rm test npx vitest run tests/sim/world/view.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-11 | `hashWorld === hashFlight` on recorded flights; pinned v1 values | unit/golden | `docker compose run --rm test npx vitest run tests/sim/world/hash.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-12 | RNG vectors unchanged; fork isolation; serialisable state | unit | `docker compose run --rm test npx vitest run tests/sim/rng.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-12 | Arrival goldens unchanged | unit | `docker compose run --rm test npx vitest run tests/sim/hyperspace-arrival.test.ts tests/persistence/autosave.test.ts` | ✅ | ⬜ pending |
| FOUND-12 | Live vs restored world hash equal over 1,000 ticks | unit | `docker compose run --rm test npx vitest run tests/sim/world/snapshot.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-12 | Lint rejects `Math.random`, `Date`, wall clock, `for..in`, bare `.sort()` | guard | `docker compose run --rm test npx vitest run tests/guards/sim-determinism-bans.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-12 | Same world hash at 30/60/144 Hz | unit | `docker compose run --rm test npx vitest run tests/sim/world/world-cadence.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-13 | Test pilot via `WorldView`/`ShipControl`; JSON round trip; integer timers | unit | `docker compose run --rm test npx vitest run tests/sim/ai/test-pilot.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-13 | AI zone rejects simulation-internal imports | guard | `docker compose run --rm test npx vitest run tests/guards/ai-zone.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-14 | `parseTestFlags` and `advanceTicks` contract | unit | `docker compose run --rm test npx vitest run tests/app/session/test-flags.test.ts tests/app/session/sim-driver.test.ts` | ❌ W0 | ⬜ pending |
| FOUND-14 | Browser `advanceTicks(N)` hash equals Node run; traffic off by default | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/tick-hook.spec.ts"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Local `verify-full` baseline run with duration recorded (D-01)
- [ ] `tests/e2e/probe-shape.spec.ts` plus shape fixtures, added to `test:e2e:fast`
- [ ] `tests/helpers/session-source.ts`; `redraw-gate.test.ts` and `economy-purity.test.ts` re-pointed and order-independent
- [ ] Recorded v1 `hashFlight` pins and current RNG vectors, captured before any `math.ts`/flight edit
- [ ] `tests/sim/world/*`, `tests/sim/ai/*`, `tests/sim/rng.test.ts`, the two guard files, `tests/helpers/tick-script.ts`, `tests/e2e/tick-hook.spec.ts`
- [ ] Framework install: none (all tools present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Game plays exactly as before | FOUND-10 | Feel/regression sanity beyond the automated core-loop suite | `docker compose up preview`; start, launch, fly, dock, trade, hyperspace, save and reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for targeted runs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
