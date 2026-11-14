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
| 12-XX-XX | TBD | TBD | FOUND-15 | T-12 / — | Throwing AI module is contained; entity keeps id, ai becomes none, deterministic hash | unit | `docker compose run --rm test npx vitest run tests/sim/world/step.test.ts` | extend | ⬜ pending |
| 12-XX-XX | TBD | TBD | FOUND-16 | T-12 / — | Malformed spawn refused with a reason; id counter unchanged | unit | `docker compose run --rm test npx vitest run tests/sim/world/store.test.ts` | extend | ⬜ pending |
| 12-XX-XX | TBD | TBD | WORLD-10 | — | Strict-range mass lock, blockage radii, torusRefused instead of torusDisengaged | unit | `docker compose run --rm test npx vitest run tests/sim/torus.test.ts tests/app/session-order.test.ts` | extend | ⬜ pending |
| 12-XX-XX | TBD | TBD | WORLD-15 | — | Deterministic inert populator, ai null, speed 0, scanner contacts, at most 50 draw calls | unit + browser | `docker compose run --rm test npx vitest run tests/sim/world/populate.test.ts` | ❌ W0 | ⬜ pending |
| 12-XX-XX | TBD | TBD | WORLD-11 | — | Flight steps behind the chart; docked stays frozen | unit + browser | `docker compose run --rm test npx vitest run tests/app/session/sim-driver.test.ts` | extend | ⬜ pending |
| 12-XX-XX | TBD | TBD | WORLD-14 | — | Old world cleared at jump commit; new ids from 101 | unit | `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts` | extend | ⬜ pending |
| 12-XX-XX | TBD | TBD | WORLD-16 | — | Traffic variants of launch, dock, torus pass; existing browser suite unchanged | unit + browser | `docker compose run --rm verify-full` | existing | ⬜ pending |
| 12-XX-XX | TBD | TBD | SAVE-08 | — | Regenerated world equals fresh arrival world; anchor nextId equals saved nextEntityId | unit | `docker compose run --rm test npx vitest run tests/persistence/save-v3.test.ts` | extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sim/world/populate.test.ts` — WORLD-15, WORLD-14
- [ ] `tests/sim/world/ship-field.test.ts` — WORLD-10
- [ ] `tests/sim/world/spawn-refusal.test.ts` — FOUND-16
- [ ] traffic-on browser spec (`?test=1&traffic=1`) — WORLD-15

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
