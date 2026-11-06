---
phase: "6"
slug: "hyperspace-navigation-persistence"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-06"
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `06-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (Node environment, one `unit` project) + Playwright 1.64.1 |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts tests/ui/chart-model.test.ts tests/persistence/save-v2.test.ts` |
| **Full suite command** | `docker compose run --rm verify` (lint → typecheck → assets:check → test → build → test:e2e) |
| **Browser suite** | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test"` |
| **Estimated runtime** | ~1–2 min quick; full verify adds build + browser suite (SwiftShader: allow ≥240 s for the countdown spec) |

---

## Sampling Rate

- **After every task commit:** Run the narrowest touched unit file, e.g. `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts`
- **After every plan wave:** Run `docker compose run --rm test` and `docker compose run --rm typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** one unit-file run per task commit

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 1 | WORLD-06, NAV-03, NAV-04, NAV-06 | T-06-01 / — | Integer Oolite distance/fuel/jump-time identities; trunc-toward-zero; fuel never negative; countdown exactly 1800 steps | unit | `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | NAV-05 | T-06-02 / — | Deterministic arrival pose from stable hash; clamped to witchpoint safety distance; no `Math.random`/clock | unit | `docker compose run --rm test npx vitest run tests/sim/hyperspace-arrival.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | NAV-01, NAV-02 | T-06-03 / — | 256 markers, 875 edges, both projections; selection state in model not DOM focus | unit | `docker compose run --rm test npx vitest run tests/ui/chart-model.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | SAVE-01, SAVE-04 | T-06-04, T-06-05 | Strict v2 schema, 17-key market allow-list, bounds before parse, corrupt/future isolation | unit | `docker compose run --rm test npx vitest run tests/persistence/save-v2.test.ts tests/persistence/save.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | SAVE-02, SAVE-03 | T-06-06 | Round-trip credits/cargo/fuel/equipment/system/clock/seed/market; in-flight pose restoration | unit | `docker compose run --rm test npx vitest run tests/persistence/autosave.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | 3 | NAV-01, NAV-02, NAV-04 | T-06-07 | F6 opens both modes, plots, selects; countdown copy; abort free | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts"` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | SAVE-05, SAVE-06 | T-06-08 | F2 docked-only save/load; overwrite confirmation; reload keeps every market price/stock | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/save-load.spec.ts tests/e2e/autosave.spec.ts"` | ❌ W0 | ⬜ pending |
| TBD | TBD | 4 | NAV-01..06, SAVE-01..06, WORLD-06 | T-06-SC | Phase gate: purity guards, drift, lint, typecheck, unit, build, full browser suite | full | `docker compose run --rm verify` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sim/hyperspace.test.ts` — WORLD-06/NAV-03/NAV-04/NAV-06 fixtures, trunc/floor discriminators, fuel integer table 0..17.
- [ ] `tests/sim/hyperspace-arrival.test.ts` — NAV-05 pose determinism, clamping, no `Math.random` (call twice + source scan).
- [ ] `tests/ui/chart-model.test.ts` — NAV-01/NAV-02 graph, projections, selection, hit test.
- [ ] `tests/persistence/save-v2.test.ts` — SAVE-01/SAVE-04 accept/reject table and `migrateV1ToV2`.
- [ ] `tests/e2e/hyperspace.spec.ts` — NAV-01..06 end-to-end plus reload-after-arrival proof.
- [ ] `tests/e2e/save-load.spec.ts` — SAVE-05 F2 screen, overwrite confirmation, failed-load isolation.
- [ ] Extend `tests/persistence/save.test.ts` / `autosave.test.ts` for v2 (v1 cases become migration fixtures).
- [ ] Move `tests/e2e/autosave.spec.ts:479` and `:684` from `version: 2` to `version: 3`.
- [ ] No framework install needed (`vitest`, `@playwright/test` already present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chart visual legibility (labels, dimming, fuel circle) | NAV-01, NAV-02 | Aesthetics are not machine-assertable; graph/selection behaviour is covered by unit + e2e | Open F6 in flight and docked; confirm 256 labels, short/long toggle, current/target distinction, dimmed unreachable names still readable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
