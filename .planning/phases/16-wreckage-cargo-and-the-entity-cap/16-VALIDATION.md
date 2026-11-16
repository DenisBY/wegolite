---
phase: "16"
slug: wreckage-cargo-and-the-entity-cap
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-16"
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. The full design is in `16-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5, fast-check 4.10.2; Playwright 1.64.1 for browser specs |
| **Config file** | `vitest.config.ts`, `vitest.acceptance.config.ts`, `playwright.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run <file>` |
| **Full suite command** | `docker compose run --rm test` (plus `lint`, `typecheck`; `assets npm run assets:check` for content plans) |
| **Estimated runtime** | minutes (slow machine; see gate policy) |

---

## Sampling Rate

- **After every task commit:** the targeted `npx vitest run <file>`
- **After every plan wave:** `test`, `lint`, `typecheck` for sim plans; add `assets:check` for content plans; `verify` for app and render plans (remote machine)
- **Before `/gsd-verify-work`:** full suite green; `verify-full` on the remote machine when the owner confirms (render change); by-hand 20-seed acceptance run after the last plan touching `src/sim/world/**` or `ships-npc.json`
- **Max feedback latency:** targeted file run, minutes

---

## Per-Task Verification Map

Filled in by the planner from `16-RESEARCH.md` § Phase Requirements to Test Map.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-XX-XX | — | — | DATA-16, WORLD-17 | — | see RESEARCH | unit / content / render / browser | see RESEARCH test map | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sim/world/debris.test.ts`, `debris-cap.test.ts`, `debris-cadence.test.ts`
- [ ] Hand-computed fixtures per rule (n_alloys per hull, lifetime table, kick examples) with the C source line beside each number
- [ ] `tests/render/debris-layer.test.ts`, `explosion-layer.test.ts`, disposal cases in the system-scene test
- [ ] Content tests for `debris` and `explosions` (schema bounds, golden, drift)
- [ ] Extensions: `kill.property.test.ts`, `tests/app/session-order.test.ts`, `budget.spec.ts`, `npc-assets.spec.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 20-seed NPC acceptance run (21 of 21) | QUAL-11 | in no gate by decision (Phase 14 IN-04) | `docker compose run --rm test npm run test:acceptance` on the remote machine after plans touching `src/sim/world/**` or `ships-npc.json` |
| Vendoring of debris assets from the local Oolite checkout | DATA-16 | script runs against the host checkout | human checkpoint per plan |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
