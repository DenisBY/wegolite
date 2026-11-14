---
phase: "11"
slug: minimal-save-schema-v3
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-14"
---

# Phase 11 — Validation Strategy

> Reconstructed from the four PLAN/SUMMARY files and the code at HEAD (state B). No coverage gaps found, so no tests were generated.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit/integration), Playwright (Chromium e2e) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run tests/persistence tests/app tests/guards/entity-id-scope.test.ts tests/contract` |
| **Full suite command** | `docker compose run --rm verify-full` |
| **Estimated runtime** | ~5 s (targeted Vitest); verify-full is minutes |

---

## Sampling Rate

- **After every task commit:** the targeted `npx vitest run <file>` from the plan
- **After every plan wave:** `docker compose run --rm test`, `lint`, `typecheck`
- **Before `/gsd-verify-work`:** `verify-full` green on the final code
- **Max feedback latency:** ~10 s for unit; browser specs only at the phase gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | SAVE-07 | T-11-01, T-11-02 | Anchor captured once after populate; no id leaves its world | unit/guard | `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts tests/app/session-order.test.ts tests/app/session/tick-parity.test.ts tests/guards/entity-id-scope.test.ts` | ✅ | ✅ green |
| 11-01-02 | 01 | 1 | SAVE-07 | T-11-03, T-11-10 | Seed derivation and v2 writer pinned before the first v3 write | unit/golden | `docker compose run --rm test npx vitest run tests/persistence/save-v3.test.ts tests/persistence/save-golden.test.ts tests/sim/rng.test.ts` | ✅ | ✅ green |
| 11-02-01 | 02 | 2 | SAVE-07 | T-11-04..T-11-08 | Strict v3 schema, required counters, no entity keys | unit | `docker compose run --rm test npx vitest run tests/persistence/save-v3.test.ts tests/app/session/world-lifecycle.test.ts` | ✅ | ✅ green |
| 11-02-02 | 02 | 2 | SAVE-07 | T-11-07, T-11-09 | Every snapshot call site writes v3; size cap checked first | unit | `docker compose run --rm test npx vitest run tests/persistence/autosave.test.ts tests/app/session/save-controller.test.ts` | ✅ | ✅ green |
| 11-02-03 | 02 | 2 | SAVE-07 | T-11-06, T-11-10 | Ordered v1→v2→v3 migration chain with goldens | unit/golden | `docker compose run --rm test npx vitest run tests/persistence/save.test.ts tests/persistence/save-v2.test.ts tests/persistence/save-golden.test.ts` | ✅ | ✅ green |
| 11-03-01 | 03 | 3 | SAVE-07 | T-11-11, T-11-12 | Warm Load and cold Continue re-anchor identically | unit | `docker compose run --rm test npx vitest run tests/app/session/world-lifecycle.test.ts tests/app/session/save-controller.test.ts tests/app/session/start-session.test.ts` | ✅ | ✅ green |
| 11-03-02 | 03 | 3 | SAVE-07 | T-11-13..T-11-15 | Hostile/future/oversized blobs classified; older build leaves v3 inert | unit | `docker compose run --rm test npx vitest run tests/persistence/save-v3.test.ts` | ✅ | ✅ green |
| 11-04-01 | 04 | 4 | SAVE-07 | T-11-16 | Real browser keeps a newer blob byte-identical | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts tests/e2e/save-load.spec.ts"` | ✅ | ⚠️ green at d36b4a1; not re-run after 4e93fa0 / 6728aa6 |
| 11-04-02 | 04 | 4 | SAVE-07 | T-11-17, T-11-18 | Records match shipped format; release gate recorded | contract | `docker compose run --rm test npx vitest run tests/contract` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Run evidence (this audit, in Docker): `vitest run tests/persistence tests/app tests/guards/entity-id-scope.test.ts tests/contract` — 34 files, 614 passed, 1 skipped, 0 failed, at HEAD 831ac28.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s (unit)
- [x] `nyquist_compliant: true` set in frontmatter

**Open caveat:** the browser specs behind 11-04-01 were last run before the two post-gate fix commits (tracked as T-11-18 in `11-SECURITY.md`). Re-run `verify-full` to refresh.

**Approval:** approved 2026-11-14

---

## Validation Audit

| Audit Date | Gaps found | Resolved | Escalated |
|------------|-----------|----------|-----------|
| 2026-11-14 | 0 | 0 | 0 |
