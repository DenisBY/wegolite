---
phase: "07"
slug: "hardening-community-release"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-07"
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `07-RESEARCH.md` § Validation Architecture. The per-task map is filled by the planner's `<automated>` verify commands.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (unit, `vitest.config.ts` project `unit`) + Playwright 1.64.1 (e2e, `playwright.config.ts`) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (diagnostic: `playwright.diag.config.ts`, not in `verify`) |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Targeted e2e command** | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test <spec>"` |
| **Full suite command** | `docker compose run --rm verify` |
| **Estimated runtime** | Unit: ~1–3 min. Full e2e on SwiftShader: ~18–20 min (76 tests, Chromium only); journey spec alone: ~10–15 min |

Container-only. A green host run is not evidence (AGENTS.md).

---

## Sampling Rate

- **After every task commit:** Run the single affected Vitest file (`docker compose run --rm test npx vitest run <file>`).
- **After every plan wave:** Run the wave's Playwright spec on Chromium.
- **Before `/gsd-verify-work`:** `docker compose run --rm verify` green, plus the cross-browser core-loop command (`e2e-cross`) and the owner's manual reference-GPU sign-off for QUAL-01.
- **Max feedback latency:** ~180 seconds for unit files; ~900 seconds for the journey spec.

---

## Per-Task Verification Map

Filled by the planner per task in each `07-NN-PLAN.md`. Requirement coverage target:

| Requirement | Behaviour | Test type | Automated Command | File Status |
|-------------|-----------|-----------|-------------------|-------------|
| QUAL-01 | Calls and triangles within budget per scene | e2e | `npx playwright test tests/e2e/budget.spec.ts` | ❌ W0 |
| QUAL-01 | Planet noise evaluations within budget | unit | `npx vitest run tests/render/planet-budget.test.ts` | ✅ exists |
| QUAL-01 | 60 fps at 1920×1080 on reference GPU | manual | `docs/PERFORMANCE.md` protocol | manual-only |
| QUAL-02 | Core loop on Firefox and WebKit (Playwright) | e2e | `npx playwright test --project=firefox tests/e2e/core-loop.spec.ts` | ❌ W0 + browser install (after spike) |
| QUAL-03 | New game → launch → trade → hyperspace → dock → save/load | e2e | `npx playwright test tests/e2e/core-loop.spec.ts` | ❌ W0 |
| QUAL-04 | Coverage thresholds on `src/sim`, `src/persistence`, `src/content` | unit + coverage | `npx vitest run --coverage` | ❌ dependency + thresholds |
| QUAL-04 | v1 golden save migrates to v2 | unit | `npx vitest run tests/persistence/save-v2.test.ts` | ⚠️ partial (inline fixture) |
| QUAL-04 | Hyperspace fixtures as golden data | unit | `npx vitest run tests/sim/hyperspace.test.ts` | ⚠️ partial (inline fixtures) |
| QUAL-05 | Context loss and restore keep sim state and save bytes | e2e | `npx playwright test tests/e2e/context-loss.spec.ts` | ❌ W0 |
| QUAL-05 | Hidden tab does not catch up simulated time or write a save | e2e | `npx playwright test tests/e2e/throttle.spec.ts` | ❌ W0 |
| QUAL-06 | README covers build, run, test, controls, browser support, fidelity pointer | contract | `npx vitest run tests/contract/docs.test.ts` | ❌ W0 |
| QUAL-06 | `FIDELITY.md` rows cite existing Wegolite paths | contract | `npx vitest run tests/contract/docs.test.ts` | ❌ W0 |
| QUAL-07 | Source-tree licence pins | unit | `npx vitest run tests/compliance.test.ts` | ✅ exists |
| QUAL-07 | `NOTICE`, `LICENSE`, `ASSETS.md`, source link in built site | e2e | `npx playwright test tests/e2e/compliance-shipped.spec.ts` | ❌ W0 |
| QUAL-08 | Zero cross-origin requests during core loop | e2e | `npx playwright test tests/e2e/network-guard.spec.ts` | ❌ W0 |
| QUAL-08 | Zero console errors and warnings during core loop | e2e | same | ⚠️ partial (errors only) |
| Phase 6 WR-04 | Destination-build throw leaves origin scene live, sim paused, failure copy visible | e2e | `npx playwright test tests/e2e/hyperspace.spec.ts` (new case) | ❌ needs seam (D-18) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/core-loop.spec.ts` — QUAL-03 journey (IndexedDB fixture for dock step; no `?test=1` at save-relevant steps, D-21)
- [ ] `tests/e2e/budget.spec.ts` — QUAL-01 per-scene calls/triangles
- [ ] `tests/e2e/context-loss.spec.ts`, `tests/e2e/throttle.spec.ts` — QUAL-05
- [ ] `tests/e2e/network-guard.spec.ts`, `tests/e2e/compliance-shipped.spec.ts` — QUAL-07, QUAL-08
- [ ] `tests/contract/docs.test.ts` — QUAL-06
- [ ] `tests/golden/save/` — checked-in v1 blob and expected v2 (QUAL-04)
- [ ] Browser spike: can Firefox and WebKit create a WebGL2 context under Playwright in the container (Research A3, A4). Gates the QUAL-02 claim.
- [ ] `@vitest/coverage-v8@5.0.5` — requires human package check first (legitimacy SUS, too-new; D-19)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 60 fps at 1920×1080, DPR 1, on owner's reference desktop | QUAL-01 | No GPU in the container; SwiftShader measures ~2.7 fps | Follow `docs/PERFORMANCE.md`: record GPU, CPU, OS, driver, browser version, per-scenario frame-time distribution |
| Real Safari smoke (if claimed) | QUAL-02 | Playwright WebKit on Linux is not Safari | Owner macOS run, or claim is narrowed per D-07 (no Safari claim) |
| Context-loss recovery copy and timeout wording | QUAL-05 | Owner-supplied copy (D-16) | Placeholder acceptable; owner reviews |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 900s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
