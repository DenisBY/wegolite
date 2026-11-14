---
phase: "10"
slug: ship-mass
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-14"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `10-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (Docker only) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/octree.test.ts tools/oolite-ingest/convert/ship-mass.test.ts tools/oolite-ingest/convert/npc-ships.test.ts tests/content tests/sim/hyperspace-blockage.test.ts tests/contract/fidelity.test.ts` |
| **Full suite command** | `docker compose run --rm test` |
| **Drift gate** | `docker compose run --rm assets npm run assets:check` |
| **Estimated runtime** | slow machine; quick run ~1–2 min, full suite several minutes |

---

## Sampling Rate

- **After every task commit:** the quick run command (or the single new test file)
- **After every plan wave:** `test`, `typecheck`, `lint`, `assets:check`
- **Before `/gsd-verify-work`:** the four above green (no `verify`/`verify-full`: pure build-time and one sim constant, owner gate policy)
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-XX-XX | TBD | TBD | DATA-11 SC1 | — | Octree depth rule, synthetic volumes, NaN/empty mesh throw | unit | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/octree.test.ts` | ❌ W0 | ⬜ pending |
| 10-XX-XX | TBD | TBD | DATA-11 SC1/SC2 | — | 16-mesh float32 golden; worked examples Cobra/Viper/Coriolis; wiki tonne check | unit | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/ship-mass.test.ts` | ❌ W0 | ⬜ pending |
| 10-XX-XX | TBD | TBD | DATA-11 SC1 | — | Records carry `mass`; strict schema rejects missing/zero/negative/non-finite | unit | `docker compose run --rm test npx vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content` | ✅ edit | ⬜ pending |
| 10-XX-XX | TBD | TBD | DATA-11 SC2 | — | Constants-ledger rows with Oolite excerpts | contract | `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts` | ✅ edit | ⬜ pending |
| 10-XX-XX | TBD | TBD | DATA-11 SC3 | — | `CORIOLIS_STATION_MASS` equals compiled Coriolis `mass`; blockage pins pass | unit | `docker compose run --rm test npx vitest run tests/sim/hyperspace-blockage.test.ts` | ✅ edit | ⬜ pending |
| 10-XX-XX | TBD | TBD | DATA-11 SC4 | — | No octree data in bundles; `src/sim` imports no octree code | guard | `docker compose run --rm test npx vitest run tests/guards` | ✅ | ⬜ pending |
| 10-XX-XX | TBD | TBD | DATA-11 SC4 | — | Changed mesh or octree rule fails drift gate | gate | `docker compose run --rm assets npm run assets:check` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tools/oolite-ingest/convert/octree.test.ts` — depth rule, synthetic volumes, guards, f32/f64 structure equality
- [ ] `tools/oolite-ingest/convert/ship-mass.test.ts` — 16-mesh golden, composite masses, wiki tonne check
- [ ] `tests/golden/content/ships-npc.json` — `fields` gains `mass`, examples carry mass

*Framework install: none.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Coriolis blockage value (computed vs 455,223,200) | DATA-11 SC3 | Owner decision (D-04) | Planned `checkpoint:decision` with both numbers; record as Key Decision |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
