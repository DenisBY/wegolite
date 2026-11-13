---
phase: "6"
slug: "hyperspace-navigation-persistence"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
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

Threat references use the plans' unique IDs: `T-06-01..03` (06-01), `T-06-04..07` (06-02), `T-06-08..10` (06-03), `T-06-11..14` (06-04), `T-06-15..17` (06-05), `T-06-18..19` (06-06).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-T1 | 06-01 | 1 | WORLD-06, NAV-03, NAV-06 | T-06-01, T-06-02 | Integer Oolite distance/fuel/jump-time identities; trunc-toward-zero; non-finite/integer input guards; fuel never negative | unit | `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts` | ✅ | ✅ green |
| 06-01-T2 | 06-01 | 1 | NAV-03, NAV-04, NAV-06 | T-06-01, T-06-02 | Countdown is exactly 1800 fixed steps; cancel/refusal changes no fuel or clock; docked H inert; commit revalidates the snapshot | unit | `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts` | ✅ | ✅ green |
| 06-01-T3 | 06-01 | 1 | NAV-05 | T-06-03 | Deterministic arrival pose from a stable hash; X/Z offset clamped to witchpoint safety distance; no `Math.random`/clock | unit | `docker compose run --rm test npx vitest run tests/sim/hyperspace-arrival.test.ts` | ✅ | ✅ green |
| 06-02-T1 | 06-02 | 1 | SAVE-01, SAVE-04 | T-06-04, T-06-06 | Version dispatch, ordered pure v1→v2 migration, strict v2 skeleton, future/corrupt classification | unit | `docker compose run --rm test npx vitest run tests/persistence/save-v2.test.ts tests/persistence/save.test.ts` | ✅ | ✅ green |
| 06-02-T2 | 06-02 | 1 | SAVE-01, SAVE-04 | T-06-04, T-06-05, T-06-06, T-06-07 | 17-key market allow-list, bounds before parse, single-seed rule, forged market/pose rejected | unit | `docker compose run --rm test npx vitest run tests/persistence/save-v2.test.ts tests/persistence/save.test.ts` | ✅ | ✅ green |
| 06-02-T3 | 06-02 | 1 | SAVE-02, SAVE-03, SAVE-06 | T-06-05, T-06-06 | Docked/in-flight snapshot and restore; market verbatim; invalid snapshot never written | unit | `docker compose run --rm test npx vitest run tests/persistence/autosave.test.ts` | ✅ extend | ✅ green |
| 06-03-T1 | 06-03 | 2 | NAV-01, NAV-02 | T-06-09 | Projection, markers and hit test in the pure model; selection never a DOM control | unit | `docker compose run --rm test npx vitest run tests/ui/chart-model.test.ts` | ✅ | ✅ green |
| 06-03-T2 | 06-03 | 2 | NAV-01, NAV-02 | T-06-09 | 256 markers, 875 edges, both ranges; unreachable systems stay selectable and named | unit | `docker compose run --rm test npx vitest run tests/ui/chart-model.test.ts` | ✅ | ✅ green |
| 06-03-T3 | 06-03 | 2 | NAV-01 | T-06-08, T-06-10 | Paint on change only; 0x0 skip; draw order; textContent-only overlay | unit | `docker compose run --rm test npx vitest run tests/ui/chart-draw.test.ts tests/ui/chart-model.test.ts` | ✅ | ✅ green |
| 06-04-T1 | 06-04 | 3 | NAV-01..06, WORLD-06 | T-06-11, T-06-12, T-06-13, T-06-14 | F6 suspend, target commit, H cancel-at-no-cost, build-before-swap arrival, one jump event, chart paint accounting | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts"` | ✅ | ✅ green |
| 06-04-T2 | 06-04 | 3 | SAVE-02, SAVE-03, SAVE-05 | T-06-11, T-06-13 | Docked-event and pre-launch anchors write once; in-flight restore installs in one block | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts"` | ✅ extend | ✅ green |
| 06-04-T3 | 06-04 | 3 | NAV-02, SAVE-03 | T-06-12, T-06-14 | Durable target on F5 and the HUD clock line; app-owned refusal copy; no context leak | unit | `docker compose run --rm test npx vitest run tests/ui/station-status.test.ts tests/ui/hud-model.test.ts tests/input/bindings.test.ts` | ✅ extend | ✅ green |
| 06-05-T1 | 06-05 | 4 | SAVE-05 | T-06-17 | F2 docked-only overlay; saveScreen context cannot leak | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/save-load.spec.ts"` | ✅ | ✅ green |
| 06-05-T2 | 06-05 | 4 | SAVE-05 | T-06-15, T-06-17 | Manual Save confirms before overwrite; only committed revisions reported | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/save-load.spec.ts"` | ✅ | ✅ green |
| 06-05-T3 | 06-05 | 4 | SAVE-01, SAVE-04 | T-06-16 | In-session Load validates first and installs in one block; failure changes nothing | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/save-load.spec.ts"` | ✅ | ✅ green |
| 06-06-T1 | 06-06 | 5 | SAVE-06 | T-06-18 | Reload reproduces every market price/stock and pose; never rerolls | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/hyperspace.spec.ts tests/e2e/save-load.spec.ts"` | ✅ extend | ✅ green |
| 06-06-T2 | 06-06 | 5 | SAVE-04, SAVE-05 | T-06-18, T-06-19 | Trigger matrix one revision each; future v3 byte-identical; corrupt v2 backed up | e2e | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/autosave.spec.ts"` | ✅ extend | ✅ green |
| 06-06-T3 | 06-06 | 5 | NAV-01..06, SAVE-01..06, WORLD-06 | T-06-SC | Phase gate: purity guards, drift, lint, typecheck, unit, build, full browser suite | full | `docker compose run --rm verify` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/sim/hyperspace.test.ts` — WORLD-06/NAV-03/NAV-04/NAV-06 fixtures, trunc/floor discriminators, fuel integer table 0..17, and the non-finite/negative/fractional input rows.
- [x] `tests/sim/hyperspace-arrival.test.ts` — NAV-05 pose determinism, X/Z offset clamp, no `Math.random` (call twice + source scan).
- [x] `tests/ui/chart-model.test.ts` — NAV-01/NAV-02 graph, projections, selection, hit test.
- [x] `tests/ui/chart-draw.test.ts` — repaint policy, draw order and 0x0 skip against a recording stub context.
- [x] `tests/persistence/save-v2.test.ts` — SAVE-01/SAVE-04 accept/reject table and `migrateV1ToV2`.
- [x] `tests/e2e/hyperspace.spec.ts` — NAV-01..06 end-to-end, chart paint accounting, H cancel and reload-after-arrival proof.
- [x] `tests/e2e/save-load.spec.ts` — SAVE-05 F2 screen, overwrite confirmation, failed-load isolation.
- [x] Extend `tests/persistence/save.test.ts` / `autosave.test.ts` for v2 (v1 cases become migration fixtures).
- [x] Move `tests/e2e/autosave.spec.ts:479` and `:684` from `version: 2` to `version: 3`; update the launch-clock case (`:266`) to the pre-launch clock and the manual-dock case (`:305`) to the tainted-skip assertions.
- [x] No framework install needed (`vitest`, `@playwright/test` already present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chart visual legibility (labels, dimming, fuel circle) | NAV-01, NAV-02 | Aesthetics are not machine-assertable; graph/selection behaviour is covered by unit + e2e | Open F6 in flight and docked; confirm 256 labels, short/long toggle, current/target distinction, dimmed unreachable names still readable |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-06 (all 18 tasks green; 1 manual-only chart-legibility check)

## Validation Audit 2026-11-06

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
